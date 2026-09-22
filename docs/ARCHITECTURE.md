# MedAgentX Architecture

## 1. Overview

MedAgentX is an intelligent, serverless, event-driven workflow optimization
framework for smart hospital services, built around **multi-agent AI**. The MVP
demonstrates one complete emergency workflow end to end:

```
Emergency Chat → AI Triage → Emergency ID → Bed Allocation
→ Doctor Assignment → Doctor Alert → Staff Alert → Admission
→ Doctor Treatment → Patient Medicine View
```

The system prioritises **speed and minimum required information**. A patient or
attendant can start emergency coordination without a name or full profile; the
name and demographics are completed later by reception during admission.

## 2. Multi-agent architecture

| Agent                     | Responsibility                                    | Implementation                              |
| ------------------------- | ------------------------------------------------- | ------------------------------------------- |
| Coordinator / Orchestrator | Runs the pipeline, persists state, records trace  | `backend/src/agents/coordinatorAgent.js`    |
| Triage Agent              | Urgency, department, specialisation from free text | `backend/src/agents/triageAgent.js`         |
| Bed Allocation Agent      | Finds and atomically reserves a suitable bed      | `backend/src/agents/bedAllocationAgent.js`  |
| Doctor Assignment Agent   | Availability + specialisation-aware doctor match  | `backend/src/agents/doctorAssignmentAgent.js` |
| Notification Agent        | Alerts assigned doctor and ward staff             | `backend/src/agents/notificationAgent.js`   |
| Admission Agent           | Emergency ID → complete patient record            | `backend/src/agents/admissionAgent.js`      |

Each agent is a pure, testable unit. The coordinator records an execution trace
(`step`, `agent`, `status`, `detail`, `at`) that is surfaced in the UI and can be
mapped 1:1 to a Step Functions execution history.

### Allocation policy

- **Bed**: triage level 1 (or stroke/neuro) → ICU first, then Emergency Ward;
  otherwise Emergency Ward → hinted ward → General. Reservation is an atomic
  compare-and-set (`UPDATE ... WHERE status='available'`) so two emergencies can
  never claim the same bed.
- **Doctor**: exact specialisation match → department availability → Emergency
  Medicine fallback → any available doctor. The chosen doctor is marked `busy`.

### Paediatric safety override

Any emergency mentioning a patient age ≤ 14, or explicitly mentioning a child /
baby without an adult age, is routed to **Pediatrics** regardless of symptom
keywords.

### Natural-language triage robustness

The rule engine normalises free text before scoring (contraction expansion,
synonym canonicalisation such as *“can’t breathe” → “cannot breathe”* and
*“pain in his left arm” → “pain in left arm”*, punctuation stripping) and matches
weighted clinical terms per category with word boundaries. This is why typed
descriptions categorise accurately and not only the suggested quick-start
phrases. Urgency combines single red-flag terms with critical combinations
(e.g. *chest pain + sweating*) and low-acuity modifiers.

### Dynamic clarifying questions

Instead of always asking the same red-flag question, the Triage Agent selects a
**category-specific follow-up question** (cardiac, neuro, trauma, surgery,
pediatric, respiratory, general, emergency). The coordinator asks that question
on the first turn and proceeds to the full workflow after the answer — or
immediately on a detected red flag.

### Doctor duty, OPD scheduling & pharmacy

- **Duty**: doctors toggle on/off duty (`PATCH /doctors/me/duty`). The Doctor
  Assignment Agent only ever selects doctors with `availability = available`, so
  off-duty doctors never receive emergency assignments.
- **OPD schedules**: admins define `doctor_schedules` (weekday × shift ×
  max patients). Appointment booking validates the schedule and enforces shift
  capacity (morning 09:00, afternoon 14:00, evening 18:00).
- **Pharmacy notification**: on any new prescription the Notification path
  raises a `pharmacy` alert (emergency prescriptions flagged `warning`). The
  Pharmacy work queue advances prescriptions through
  `pending → preparing → ready → dispensed`, alerting the prescribing doctor
  when medicines are ready or dispensed.
- **Department correction**: reception can override an AI-assigned department
  (`PATCH /emergency/:id/triage`), which releases the previous doctor and re-runs
  doctor assignment — keeping the allocation explicit and reviewable.

## 3. Serverless mapping

| Concern        | AWS                              | Local MVP                       |
| -------------- | -------------------------------- | ------------------------------- |
| Frontend       | S3 + CloudFront                  | React/Vite                      |
| API            | API Gateway + Lambda             | Express                         |
| Agents         | Lambda                           | `agents/*`                      |
| Orchestration  | Step Functions                   | `coordinatorAgent.js`           |
| LLM            | Amazon Bedrock                   | Rule engine (+ optional OpenAI) |
| Data           | DynamoDB                         | SQLite                          |
| Events/alerts  | EventBridge + SQS + SNS/SES      | `alerts` table + UI polling     |
| Auth           | Cognito                          | JWT + bcrypt                    |
| Monitoring     | CloudWatch                       | `activity_logs`                 |

See `src/aws/template.yaml` and `src/aws/statemachine/emergency-workflow.asl.json`.

## 4. Data model

Master (seeded): `departments`, `wards`, `beds`, `doctors`, `staff`, `medicines`,
`users`.

Transactional (empty until workflow runs): `emergencies`, `patients`,
`admissions`, `prescriptions`, `prescription_items`, `appointments`, `alerts`,
`activity_logs`.

An emergency becomes a patient through the Admission Agent, which:
1. creates the patient record (or updates it),
2. creates the admission and occupies the bed,
3. appends `ADMITTED` to the emergency workflow timestamps (original timestamps
   are preserved),
4. provisions a patient login (username = patient ID, password = emergency
   access code),
5. raises an admission alert to the assigned doctor.

## 5. Role-based access control

Authorization is enforced **server-side** by permission, never by hiding UI.
Permissions are declared in `backend/src/permissions.js`; middleware
(`authenticate`, `requireRole`, `requirePermission`) guards every route.

| Capability                     | Admin | Reception | Ward | Doctor | Pharmacy | Patient |
| ------------------------------ | :---: | :-------: | :--: | :----: | :------: | :-----: |
| User/role & hospital config    |  ✅   |           |      |        |          |         |
| Operational overview/audit     |  ✅   |           |      |        |          |         |
| Emergency intake (AI chat)     |       |    ✅     |      |        |          |         |
| Appointment (OPD) chat         |       |    ✅     |      |        |          |         |
| View emergencies               |  ✅   |    ✅     |  ✅  |  own   |          |         |
| Prepare bed / mark arrival     |       |           |  ✅  |        |          |         |
| Admit / start treatment        |  ✅   |    ✅     |  ✅* |  own   |          |         |
| Edit patient demographic record|  ✅   |    ✅     |      |  own   |          |         |
| Correct emergency department   |  ✅   |    ✅     |      |        |          |         |
| Clinical notes & prescriptions |       |           |      |   ✅   |          |         |
| Prepare / dispense medicines   |       |           |      |        |    ✅    |         |
| Doctor schedule management     |  ✅   |           |      |        |          |         |
| Doctor on/off duty             |       |           |      |   ✅   |          |         |
| Book appointments (any patient)|  ✅   |    ✅     |      |        |          |         |
| Book own appointment           |       |           |      |        |          |   ✅    |
| View own record & medicines    |       |           |      |        |          |   ✅    |

\* Ward staff can confirm admission; reception or the assigned doctor completes
registration / starts treatment. The emergency intake chatbot and OPD assistant
are reception-only by policy.

Notable enforcement examples:
- The emergency chat endpoint requires the `chat:use` permission (reception);
  unauthenticated calls receive `401`, other roles `403`.
- Emergency, admission and pharmacy alerts are **targeted** (`recipient_doctor_id`)
  so only the concerned doctor is alerted and can acknowledge them; other
  doctors never see or act on another doctor's case.
- Doctors may only admit, start treatment for, or edit records of patients
  assigned to them; they must be **on duty** (`availability = available`) to be
  assigned new emergencies.
- Reception patient responses strip clinical data (`prescriptions` omitted).
- Pharmacy can read prescriptions and update fulfilment only; it cannot read
  clinical notes beyond the prescription it must prepare, and cannot chat.
- A patient can only read their own patient/emergency/prescription/appointment
  data; directory endpoints are blocked for patients.
- Admission and appointment listings are scoped by role.

## 6. Security notes

- Passwords hashed with bcrypt; sessions are signed JWTs.
- Emergency tracking is accessible with `Emergency ID + access code` only.
- Every sensitive mutation writes an `activity_logs` audit entry.
- The public emergency chat endpoint is deliberately unauthenticated to remove
  friction during life-threatening events; it can only create emergencies and
  never reads existing records.
