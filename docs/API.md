# MedAgentX API

Base URL (local): `http://localhost:4000/api`

Authenticated routes expect `Authorization: Bearer <jwt>`. Authorization is
enforced by role/permission on the server.

## Auth

| Method | Path                     | Access          | Description                              |
| ------ | ------------------------ | --------------- | ---------------------------------------- |
| POST   | `/auth/login`            | public          | Username/password login → JWT            |
| POST   | `/auth/patient-access`   | public          | Patient ID/emergency ID + access code    |
| POST   | `/auth/emergency-access` | public          | Emergency ID + access code → patient JWT |
| GET    | `/auth/me`               | authenticated   | Current user + permissions               |
| POST   | `/auth/change-password`  | authenticated   | Change own password                      |

## Meta

| Method | Path        | Access | Description                                    |
| ------ | ----------- | ------ | ---------------------------------------------- |
| GET    | `/health`   | public | Health check                                   |
| GET    | `/meta`     | public | Roles, permissions, demo accounts, workflow    |

## Emergency & agents

| Method | Path                          | Access                         | Description                                  |
| ------ | ----------------------------- | ------------------------------ | -------------------------------------------- |
| POST   | `/emergency/chat`             | reception (chat:use)           | Emergency intake chat (runs agent pipeline)  |
| POST   | `/emergency/chat/authenticated` | reception (chat:use)         | Alias of `/emergency/chat`                   |
| GET    | `/emergency/public/:id?code=` | public (ID + code)             | Attendant/patient status tracking            |
| GET    | `/emergency`                  | emergency:read[/assigned]      | List emergencies (role-scoped)               |
| GET    | `/emergency/:id`              | emergency:read[/assigned]      | Emergency detail (with timeline)             |
| POST   | `/emergency/:id/prepare`      | bed:update                     | Ward staff mark bed prepared                 |
| POST   | `/emergency/:id/arrive`       | bed:update                     | Ward staff mark patient arrived              |
| POST   | `/emergency/:id/admit`        | emergency:admit / admission:create | Admission Agent → patient record (doctor: own patients only) |
| POST   | `/emergency/:id/start-treatment` | clinical:write / emergency:admit | Create a minimal patient record so the doctor can treat immediately |
| PATCH  | `/emergency/:id/triage`       | emergency:triage               | Correct department/specialisation and reassign doctor |
| POST   | `/emergency/:id/cancel`       | reception / admin              | Cancel an emergency                          |
| POST   | `/emergency/:id/reissue-code` | reception / admin              | Reissue the temporary access code            |

`GET /emergency/public/:id` no longer requires the access code.

## Patients & clinical

| Method | Path                          | Access                                   | Description                       |
| ------ | ----------------------------- | ---------------------------------------- | --------------------------------- |
| GET    | `/patients`                   | patient:read[/assigned]                  | List patients (role-scoped)       |
| POST   | `/patients`                   | patient:register                         | Register an OPD patient + portal login |
| GET    | `/patients/me`                | patient:read:self                        | Patient self dashboard + appointments |
| GET    | `/patients/:id`               | patient:read[/assigned/self]             | Patient detail                    |
| PATCH  | `/patients/:id`               | patient:register / patient:read          | Update non-clinical demographics  |
| GET    | `/patients/:id/prescriptions` | prescription:read[/self]                 | Prescriptions + admission         |
| POST   | `/prescriptions`              | prescription:write + clinical:write      | Create prescription (doctor)      |
| GET    | `/prescriptions?patientId=`   | prescription:read[/self]                 | List prescriptions                |
| POST   | `/clinical-notes`             | clinical:write                           | Add free-text clinical note       |
| GET    | `/admissions`                 | admission:read                           | Admissions (role-scoped)          |
| PATCH  | `/admissions/:id/status`      | treatment:update                         | admitted / under_treatment / discharged |

## Catalog

| Method | Path                        | Access           |
| ------ | --------------------------- | ---------------- |
| GET    | `/beds`                     | bed:read         |
| PATCH  | `/beds/:id`                 | bed:update       |
| POST/DELETE | `/beds[/:id]`          | hospital:manage  |
| GET    | `/wards`, `/departments`, `/doctors`, `/medicines` | staff roles |
| GET    | `/staff`                    | hospital:manage  |
| POST   | `/wards`, `/departments`, `/doctors`, `/staff`, `/medicines` | hospital:manage |
| PATCH  | `/doctors/me/duty`          | doctor:duty      |
| GET    | `/doctors/:id/schedule`     | staff roles      |
| POST   | `/doctors/:id/schedule`     | schedule:manage  |
| DELETE | `/doctor-schedule/:id`      | schedule:manage  |

## Appointments

| Method | Path                          | Access                          |
| ------ | ----------------------------- | ------------------------------- |
| GET    | `/appointments`               | appointment:read[/self]         |
| GET    | `/appointments/doctors`       | bookable doctor list (safe subset) |
| GET    | `/appointments/availability?doctorId=&date=` | shift capacity |
| POST   | `/appointments`               | appointment:manage / appointment:create:self |
| PATCH  | `/appointments/:id/status`    | appointment:manage / appointment:read |

## Pharmacy

| Method | Path                          | Access             |
| ------ | ----------------------------- | ------------------ |
| GET    | `/pharmacy/prescriptions[?status=]` | pharmacy:read |
| PATCH  | `/pharmacy/prescriptions/:id` | pharmacy:dispense (pending → preparing → ready → dispensed) |

## Alerts, appointments, admin

| Method | Path                          | Access             |
| ------ | ----------------------------- | ------------------ |
| GET    | `/alerts`                     | alert:read         |
| GET    | `/alerts/unread-count`        | alert:read         |
| POST   | `/alerts/:id/read`            | alert:read         |
| POST   | `/alerts/:id/ack`             | alert:ack          |
| GET    | `/appointments`               | appointment:read   |
| POST   | `/appointments`               | appointment:manage |
| PATCH  | `/appointments/:id/status`    | appointment:manage |
| GET    | `/admin/overview`             | analytics:read     |
| GET    | `/admin/activity`             | audit:read         |
| GET    | `/admin/permissions`          | user:manage        |
| GET/POST/PATCH/DELETE | `/admin/users[/:id]` | user:manage        |
