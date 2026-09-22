-- MedAgentX schema
-- Master data + transactional tables. Patients/prescriptions/admissions start EMPTY.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,              -- emergency | icu | general | pediatric | cardiology
  floor      TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS beds (
  id         TEXT PRIMARY KEY,
  ward_id    TEXT NOT NULL REFERENCES wards(id),
  bed_number TEXT NOT NULL,
  bed_type   TEXT NOT NULL,              -- emergency | icu | general | pediatric | cardiac
  status     TEXT NOT NULL DEFAULT 'available', -- available | reserved | occupied | cleaning | maintenance
  current_emergency_id TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (ward_id, bed_number)
);

CREATE TABLE IF NOT EXISTS doctors (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  specialization TEXT NOT NULL,
  department_id  TEXT NOT NULL REFERENCES departments(id),
  availability   TEXT NOT NULL DEFAULT 'available', -- available | busy | off_duty
  current_status TEXT,
  email          TEXT,
  phone          TEXT,
  room           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,               -- ward_staff | reception
  ward_id    TEXT REFERENCES wards(id),
  status     TEXT NOT NULL DEFAULT 'on_duty',
  email      TEXT,
  phone      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medicines (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  form     TEXT NOT NULL,                 -- tablet | syrup | injection | capsule | infusion
  strength TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT NOT NULL,            -- admin | reception | ward_staff | doctor | patient
  doctor_id     TEXT REFERENCES doctors(id),
  staff_id      TEXT REFERENCES staff(id),
  patient_id    TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===================== Transactional (starts empty) =====================

CREATE TABLE IF NOT EXISTS emergencies (
  id                   TEXT PRIMARY KEY,          -- EMG-XXXXXX
  access_code          TEXT NOT NULL,             -- short code for attendant/patient login
  status               TEXT NOT NULL,             -- EMERGENCY_DETECTED | BED_RESERVED | DOCTOR_ASSIGNED | STAFF_ALERTED | PATIENT_ARRIVED | ADMITTED | CANCELLED
  urgency              TEXT,                      -- critical | high | moderate | low
  triage_level         INTEGER,                   -- 1 (most critical) .. 5
  required_department  TEXT,
  required_specialization TEXT,
  chief_complaint      TEXT,
  summary              TEXT,
  recommended_actions  TEXT,                      -- JSON array
  triage_confidence    REAL,
  triage_evidence      TEXT,                      -- JSON { matchedSymptoms, urgencyTriggers, category, method }
  conversation         TEXT NOT NULL DEFAULT '[]',-- JSON chat transcript
  bed_id               TEXT REFERENCES beds(id),
  ward_id              TEXT REFERENCES wards(id),
  doctor_id            TEXT REFERENCES doctors(id),
  patient_id           TEXT,
  created_by           TEXT,
  timestamps           TEXT NOT NULL DEFAULT '{}',-- JSON workflow timestamps
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patients (
  id               TEXT PRIMARY KEY,              -- PAT-XXXXXX
  emergency_id     TEXT REFERENCES emergencies(id),
  patient_type     TEXT NOT NULL DEFAULT 'emergency', -- emergency | opd
  name             TEXT NOT NULL,
  age              INTEGER,
  gender           TEXT,
  contact          TEXT,
  address          TEXT,
  blood_group      TEXT,
  emergency_details TEXT,
  attendant_name   TEXT,
  attendant_contact TEXT,
  medical_history  TEXT,
  allergies        TEXT,
  portal_code      TEXT,                          -- patient portal login code
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admissions (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  emergency_id TEXT REFERENCES emergencies(id),
  ward_id      TEXT REFERENCES wards(id),
  bed_id       TEXT REFERENCES beds(id),
  doctor_id    TEXT REFERENCES doctors(id),
  status       TEXT NOT NULL DEFAULT 'admitted', -- admitted | under_treatment | discharged
  admission_type TEXT NOT NULL DEFAULT 'emergency',
  notes        TEXT,
  admitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  discharged_at TEXT
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patients(id),
  doctor_id    TEXT NOT NULL REFERENCES doctors(id),
  admission_id TEXT REFERENCES admissions(id),
  diagnosis    TEXT,
  clinical_notes TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  fulfillment_status TEXT NOT NULL DEFAULT 'pending', -- pending | preparing | ready | dispensed
  prepared_by  TEXT,
  dispensed_at TEXT,
  source       TEXT NOT NULL DEFAULT 'opd',       -- emergency | opd
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id              TEXT PRIMARY KEY,
  prescription_id TEXT NOT NULL REFERENCES prescriptions(id),
  medicine_id     TEXT REFERENCES medicines(id),
  medicine_name   TEXT NOT NULL,
  dosage          TEXT NOT NULL,
  frequency       TEXT NOT NULL,
  duration        TEXT NOT NULL,
  before_after_food TEXT,
  instructions    TEXT
);

CREATE TABLE IF NOT EXISTS appointments (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT REFERENCES patients(id),
  doctor_id    TEXT REFERENCES doctors(id),
  department_id TEXT REFERENCES departments(id),
  scheduled_at TEXT,
  shift        TEXT,                      -- morning | afternoon | evening
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | completed | cancelled
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id           TEXT PRIMARY KEY,
  doctor_id    TEXT NOT NULL REFERENCES doctors(id),
  day_of_week  INTEGER NOT NULL,          -- 0=Sunday .. 6=Saturday
  shift        TEXT NOT NULL,             -- morning | afternoon | evening
  max_patients INTEGER NOT NULL DEFAULT 10,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (doctor_id, day_of_week, shift)
);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,             -- doctor_alert | staff_alert | admission_alert | appointment | pharmacy | system
  severity     TEXT NOT NULL DEFAULT 'info', -- info | warning | critical
  recipient_role TEXT,
  recipient_id TEXT,                      -- user id
  recipient_doctor_id TEXT,               -- targeted doctor (only that doctor sees it)
  emergency_id TEXT,
  patient_id   TEXT,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  payload      TEXT,                      -- JSON
  status       TEXT NOT NULL DEFAULT 'unread', -- unread | read | acknowledged | resolved
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  read_at      TEXT
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  entity        TEXT,
  entity_id     TEXT,
  details       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_beds_ward ON beds(ward_id, status);
CREATE INDEX IF NOT EXISTS idx_doctors_dept ON doctors(department_id, availability);
CREATE INDEX IF NOT EXISTS idx_emergencies_status ON emergencies(status);
CREATE INDEX IF NOT EXISTS idx_alerts_recipient ON alerts(recipient_role, recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
