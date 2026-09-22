# MedAgentX

**Intelligent Serverless Workflow Optimization Framework for Smart Hospital Services using Multi-Agent Artificial Intelligence**

A clean, modern hospital web application with **role-based access control** and a
**multi-agent AI emergency workflow**. One complete journey is demonstrated end to
end: from a natural-language emergency chat to admission and doctor treatment.

```
Emergency Chat → AI Triage → Emergency ID → Bed Allocation
→ Doctor Assignment → Doctor Alert → Staff Alert → Admission → Treatment
```

> The project intentionally demonstrates **one complete emergency workflow**
> rather than a full hospital ERP.

---

## Quick start

Requires **Node.js ≥ 22.5** (uses the built-in `node:sqlite`).

```bash
# 1. install dependencies
npm run install:all

# 2. seed hospital master data (departments, doctors, staff, wards, beds,
#    medicines, users) — NO patient records are created
npm run seed

# 3. run API + web app together
npm run dev
```

Then open **http://localhost:5173**.

- API: http://localhost:4000
- Health: http://localhost:4000/api/health

Run the two services separately if you prefer:

```bash
npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:5173
```

To reset all data (removes any demo patients created during a walkthrough):

```bash
npm run seed:reset
```

---

## Demo accounts

| Role            | Username    | Password        | Notes                            |
| --------------- | ----------- | --------------- | -------------------------------- |
| Admin           | `admin`     | `Admin@123`     | Full system administration       |
| Reception       | `reception` | `Reception@123` | Registration, OPD & appointments |
| Emergency/Ward  | `ward`      | `Ward@123`      | Bed prep, arrival, admission     |
| Pharmacy        | `pharmacy`  | `Pharmacy@123`  | Prescription preparation queue   |
| Doctor          | `dr.arjun`  | `Doctor@123`    | Emergency Medicine               |
| Doctor          | `dr.priya`  | `Doctor@123`    | Cardiology                       |
| Doctor          | `dr.meera`  | `Doctor@123`    | Emergency Medicine               |
| Doctor          | `dr.sneha`  | `Doctor@123`    | Orthopedics                      |
| Doctor          | `dr.ananya` | `Doctor@123`    | Pediatrics                       |
| Doctor          | `dr.karan`  | `Doctor@123`    | General Medicine                 |

Patients do not have a seeded login. A patient account is created on registration
(emergency admission or OPD), and logs in with the **Patient ID** and the access
code issued at registration.

---

## Try the full workflow

1. Log in as **reception** and open **Emergency Intake** (the AI chatbot is
   reception-only). Describe an emergency, e.g. *“My father has severe chest pain
   and is sweating, he is 58 years old”*.
2. Answer the category-specific clarifying question. The coordinator then runs:
   triage → bed reservation → doctor assignment → alerts, and issues a
   **temporary Emergency ID + access code**.
3. Log in as **ward** → see the incoming alert → *Mark bed prepared* →
   *Mark patient arrived*.
4. Complete registration either as **reception** or as the **assigned doctor**:
   the doctor can click **Start treatment** to create a minimal record instantly
   (no full form needed), or either can *Add full details*. The Emergency ID
   becomes a permanent **Patient ID**.
5. Log in as the assigned **doctor** → add a prescription (medicine, dosage,
   frequency, duration, before/after food) and clinical notes.
6. Log in as **pharmacy** → the prescription appears in the queue (emergency
   highlighted) → *Start preparing* → *Mark ready* → *Dispensed*.
7. Log in as the **patient** (Patient ID + access code) → dashboard with status,
   doctor, ward/bed, medicine routine and self-service appointment booking.

Attendants/patients can track any emergency from **Track Status** with its ID
(no access code required). Staff see all patients/emergencies (doctors see only
their own) and can click a row for details.

### OPD (outpatient) flow

Reception → **Emergency & Appointments** → **Appointments** mode → choose
*Existing patient* (enter Patient ID) or *New patient* (registration popup) →
the Patient ID is confirmed on the chat → pick doctor, date and shift (capacity
checked against the doctor's schedule) → appointment booked. Patients can also
book their own appointments from the patient dashboard.

---

## Role dashboards

| Role                  | Highlights |
| --------------------- | ---------- |
| **Emergency & Appointments (reception)** | AI chatbot with **Emergency** and **Appointments (OPD)** modes, quick symptoms, dynamic triage, department correction, new-patient popup + on-chat registration |
| **Reception**         | Search by Patient/Emergency ID, register OPD patients, book appointments, bed availability, admission details |
| **Emergency/Ward**    | Incoming alerts, required preparation, mark bed prepared / patient arrived / confirm admission, bed occupancy |
| **Doctor**            | On/off duty toggle, only assigned patients, **start treatment without full registration**, edit records, clinical notes, prescriptions, appointments & OPD schedule |
| **Pharmacy**          | Prescription queue with emergency highlights, preparing → ready → dispensed workflow, instant notification on new prescriptions |
| **Patient**           | Patient ID, status, doctor, ward/bed, prescriptions with **live pharmacy status** (sent → preparing → ready → dispensed), daily medicine schedule, **book own appointments** |
| **Admin**             | Operational overview, bed inventory, agent health, audit log, manage doctors/staff/departments/wards/beds/medicines/users/permissions and **doctor OPD schedules** (days, shifts, patients per shift) |

---

## Seed data rules

Seeded on `npm run seed`:

- **Yes:** Departments, Doctors, Emergency/Ward Staff, Reception & Pharmacy
  staff, Wards, Beds (Emergency Ward has both available and occupied beds),
  Medicines, Users, Doctor OPD schedules.
- **No:** Patients, Prescriptions, Admissions, Appointments, Alerts.

Patient records appear only when created through the application: emergency
admission, or OPD registration (reception / appointment assistant).

---

## Project structure

```
MedAgentX/
├── src/
│   ├── frontend/            React + Vite app (role dashboards, emergency chatbot)
│   │   └── src/
│   │       ├── pages/       Login, EmergencyIntake, TrackStatus, Doctor/Patient/
│   │       │                Reception/Ward/Admin dashboards
│   │       ├── components/  Layout, StatusTimeline, ProtectedRoute, UI kit
│   │       ├── auth.jsx     Auth context + permission helpers
│   │       └── api.js       Fetch client
│   ├── backend/             Express API + multi-agent orchestrator
│   │   └── src/
│   │       ├── agents/      Triage, BedAllocation, DoctorAssignment,
│   │       │                Notification, Admission, Coordinator
│   │       ├── routes/      auth, emergency, patients, clinical, catalog,
│   │       │                alerts, admin, appointments
│   │       ├── auth.js      JWT + RBAC middleware
│   │       ├── permissions.js  Role → permission map
│   │       ├── db.js        node:sqlite wrapper
│   │       ├── schema.sql   Full data model
│   │       └── seed.js      Hospital master data (no patients)
│   ├── aws/                 Serverless reference stack (SAM, Step Functions,
│   │                        Lambda entrypoints, DynamoDB seed)
│   └── ml_model/            Synthetic triage dataset + baseline classifier
├── docs/                    ARCHITECTURE.md, API.md
├── architecture/            Diagrams
├── dataset/                 Raw/processed data
├── results/                 ML metrics output
└── presentation/
```

---

## Security & RBAC

- Passwords hashed with bcrypt; JWT sessions.
- Server-side permission checks on every route (`permissions.js` +
  `requirePermission` / `requireRole`); the UI only reflects what the API allows.
- Reception responses strip clinical data; doctors only see assigned patients;
  patients only see their own data; directory endpoints are blocked for patients.
- The emergency chat endpoint is restricted to the **reception** role; other
  roles and the public receive `403` / `401`.
- Every sensitive action writes an audit entry (`activity_logs`).

See `docs/ARCHITECTURE.md` for the full permission matrix.

---

## Serverless architecture

The local MVP maps directly onto AWS:

React/Vite + S3 + CloudFront · API Gateway · Lambda · Step Functions ·
Amazon Bedrock · DynamoDB · EventBridge/SQS · Cognito · CloudWatch · SNS/SES.

See `src/aws/` and `src/aws/README.md`. The Step Functions definition is in
`src/aws/statemachine/emergency-workflow.asl.json`.

---

## Implementation phases

| Phase | Scope                                              | Status |
| ----- | -------------------------------------------------- | ------ |
| 1     | Emergency chatbot → AI triage → Emergency ID       | ✅     |
| 2     | Bed allocation → Doctor assignment → Alerts        | ✅     |
| 3     | Emergency admission → Reception/Ward workflow      | ✅     |
| 4     | Doctor prescriptions → Patient medicine view       | ✅     |
| 5     | Role dashboards → Admin dashboard → audit logs     | ✅     |

---

## Tech stack

React 18 · Vite · React Router · Express · `node:sqlite` · JWT · bcrypt ·
scikit-learn (optional triage baseline).

All seeded names and data are clearly fictional.
