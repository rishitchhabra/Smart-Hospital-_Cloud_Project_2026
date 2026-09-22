import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { db, run, get, initSchema } from './db.js';

const now = () => new Date().toISOString();
const pw = (p) => bcrypt.hashSync(p, 10);

const DEPARTMENTS = [
  { id: 'DEP-EMR', name: 'Emergency', code: 'EMR', description: 'Emergency & trauma care' },
  { id: 'DEP-GEN', name: 'General Medicine', code: 'GEN', description: 'Internal medicine' },
  { id: 'DEP-CAR', name: 'Cardiology', code: 'CAR', description: 'Heart & vascular care' },
  { id: 'DEP-NEU', name: 'Neurology', code: 'NEU', description: 'Brain & nervous system' },
  { id: 'DEP-ORT', name: 'Orthopedics', code: 'ORT', description: 'Bones, joints & trauma' },
  { id: 'DEP-PED', name: 'Pediatrics', code: 'PED', description: 'Child healthcare' },
  { id: 'DEP-SUR', name: 'General Surgery', code: 'SUR', description: 'Surgical services' },
];

const WARDS = [
  { id: 'WRD-EMR', name: 'Emergency Ward', type: 'emergency', floor: 'Ground', description: 'Emergency stabilization & intake' },
  { id: 'WRD-ICU', name: 'ICU', type: 'icu', floor: '1st', description: 'Intensive care unit' },
  { id: 'WRD-GEN', name: 'General Ward', type: 'general', floor: '2nd', description: 'General inpatient care' },
  { id: 'WRD-PED', name: 'Pediatric Ward', type: 'pediatric', floor: '3rd', description: 'Child inpatient care' },
  { id: 'WRD-CAR', name: 'Cardiology Ward', type: 'cardiology', floor: '4th', description: 'Cardiac inpatient care' },
];

// Emergency ward intentionally contains BOTH available and occupied beds
// so the Bed Allocation Agent can demonstrate real allocation logic.
const BEDS = [
  { ward_id: 'WRD-EMR', bed_number: 'EM-01', bed_type: 'emergency', status: 'occupied' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-02', bed_type: 'emergency', status: 'available' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-03', bed_type: 'emergency', status: 'available' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-04', bed_type: 'emergency', status: 'occupied' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-05', bed_type: 'emergency', status: 'available' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-06', bed_type: 'emergency', status: 'available' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-07', bed_type: 'emergency', status: 'cleaning' },
  { ward_id: 'WRD-EMR', bed_number: 'EM-08', bed_type: 'emergency', status: 'available' },

  { ward_id: 'WRD-ICU', bed_number: 'ICU-01', bed_type: 'icu', status: 'available' },
  { ward_id: 'WRD-ICU', bed_number: 'ICU-02', bed_type: 'icu', status: 'occupied' },
  { ward_id: 'WRD-ICU', bed_number: 'ICU-03', bed_type: 'icu', status: 'available' },
  { ward_id: 'WRD-ICU', bed_number: 'ICU-04', bed_type: 'icu', status: 'maintenance' },

  { ward_id: 'WRD-GEN', bed_number: 'GN-01', bed_type: 'general', status: 'available' },
  { ward_id: 'WRD-GEN', bed_number: 'GN-02', bed_type: 'general', status: 'available' },
  { ward_id: 'WRD-GEN', bed_number: 'GN-03', bed_type: 'general', status: 'occupied' },
  { ward_id: 'WRD-GEN', bed_number: 'GN-04', bed_type: 'general', status: 'available' },
  { ward_id: 'WRD-GEN', bed_number: 'GN-05', bed_type: 'general', status: 'available' },

  { ward_id: 'WRD-PED', bed_number: 'PD-01', bed_type: 'pediatric', status: 'available' },
  { ward_id: 'WRD-PED', bed_number: 'PD-02', bed_type: 'pediatric', status: 'available' },
  { ward_id: 'WRD-PED', bed_number: 'PD-03', bed_type: 'pediatric', status: 'occupied' },

  { ward_id: 'WRD-CAR', bed_number: 'CD-01', bed_type: 'cardiac', status: 'available' },
  { ward_id: 'WRD-CAR', bed_number: 'CD-02', bed_type: 'cardiac', status: 'available' },
  { ward_id: 'WRD-CAR', bed_number: 'CD-03', bed_type: 'cardiac', status: 'available' },
];

const DOCTORS = [
  { id: 'DOC-001', name: 'Dr. Arjun Mehta', specialization: 'Emergency Medicine', department_id: 'DEP-EMR', availability: 'available', current_status: 'On shift — Emergency', email: 'arjun.mehta@medagentx.health', phone: '+1-555-0101', room: 'ER-101' },
  { id: 'DOC-002', name: 'Dr. Priya Nair', specialization: 'Cardiology', department_id: 'DEP-CAR', availability: 'available', current_status: 'On shift — Cardiology', email: 'priya.nair@medagentx.health', phone: '+1-555-0102', room: 'CD-201' },
  { id: 'DOC-003', name: 'Dr. Rohan Verma', specialization: 'Neurology', department_id: 'DEP-NEU', availability: 'busy', current_status: 'In surgery', email: 'rohan.verma@medagentx.health', phone: '+1-555-0103', room: 'NE-301' },
  { id: 'DOC-004', name: 'Dr. Sneha Kapoor', specialization: 'Orthopedics', department_id: 'DEP-ORT', availability: 'available', current_status: 'On shift — Orthopedics', email: 'sneha.kapoor@medagentx.health', phone: '+1-555-0104', room: 'OR-401' },
  { id: 'DOC-005', name: 'Dr. Vikram Rao', specialization: 'General Surgery', department_id: 'DEP-SUR', availability: 'off_duty', current_status: 'Off duty', email: 'vikram.rao@medagentx.health', phone: '+1-555-0105', room: 'SU-501' },
  { id: 'DOC-006', name: 'Dr. Ananya Iyer', specialization: 'Pediatrics', department_id: 'DEP-PED', availability: 'available', current_status: 'On shift — Pediatrics', email: 'ananya.iyer@medagentx.health', phone: '+1-555-0106', room: 'PD-601' },
  { id: 'DOC-007', name: 'Dr. Karan Shah', specialization: 'General Medicine', department_id: 'DEP-GEN', availability: 'available', current_status: 'On shift — General Medicine', email: 'karan.shah@medagentx.health', phone: '+1-555-0107', room: 'GM-701' },
  { id: 'DOC-008', name: 'Dr. Meera Joshi', specialization: 'Emergency Medicine', department_id: 'DEP-EMR', availability: 'available', current_status: 'On shift — Emergency', email: 'meera.joshi@medagentx.health', phone: '+1-555-0108', room: 'ER-102' },
  { id: 'DOC-009', name: 'Dr. Dev Patel', specialization: 'Cardiology', department_id: 'DEP-CAR', availability: 'busy', current_status: 'In cath lab', email: 'dev.patel@medagentx.health', phone: '+1-555-0109', room: 'CD-202' },
  { id: 'DOC-010', name: 'Dr. Nisha Reddy', specialization: 'General Medicine', department_id: 'DEP-GEN', availability: 'available', current_status: 'On shift — General Medicine', email: 'nisha.reddy@medagentx.health', phone: '+1-555-0110', room: 'GM-702' },
];

const STAFF = [
  { id: 'STF-001', name: 'Nurse Emily Carter', role: 'ward_staff', ward_id: 'WRD-EMR', status: 'on_duty', email: 'emily.carter@medagentx.health', phone: '+1-555-0201' },
  { id: 'STF-002', name: 'Nurse Daniel Brooks', role: 'ward_staff', ward_id: 'WRD-EMR', status: 'on_duty', email: 'daniel.brooks@medagentx.health', phone: '+1-555-0202' },
  { id: 'STF-003', name: 'Nurse Sofia Ramirez', role: 'ward_staff', ward_id: 'WRD-ICU', status: 'on_duty', email: 'sofia.ramirez@medagentx.health', phone: '+1-555-0203' },
  { id: 'STF-004', name: 'Nurse Jacob Miller', role: 'ward_staff', ward_id: 'WRD-GEN', status: 'off_duty', email: 'jacob.miller@medagentx.health', phone: '+1-555-0204' },
  { id: 'STF-005', name: 'Nurse Aisha Khan', role: 'ward_staff', ward_id: 'WRD-PED', status: 'on_duty', email: 'aisha.khan@medagentx.health', phone: '+1-555-0205' },
  { id: 'STF-006', name: 'Rachel Greene', role: 'reception', ward_id: null, status: 'on_duty', email: 'rachel.greene@medagentx.health', phone: '+1-555-0301' },
  { id: 'STF-007', name: 'Tom Alvarez', role: 'reception', ward_id: null, status: 'on_duty', email: 'tom.alvarez@medagentx.health', phone: '+1-555-0302' },
  { id: 'STF-008', name: 'Pharmacist Maya Lin', role: 'pharmacist', ward_id: null, status: 'on_duty', email: 'maya.lin@medagentx.health', phone: '+1-555-0401' },
  { id: 'STF-009', name: 'Pharmacist Omar Haddad', role: 'pharmacist', ward_id: null, status: 'on_duty', email: 'omar.haddad@medagentx.health', phone: '+1-555-0402' },
];

const MEDICINES = [
  { id: 'MED-001', name: 'Paracetamol', form: 'tablet', strength: '500 mg', quantity: 2400 },
  { id: 'MED-002', name: 'Ibuprofen', form: 'tablet', strength: '400 mg', quantity: 1800 },
  { id: 'MED-003', name: 'Aspirin', form: 'tablet', strength: '75 mg', quantity: 1500 },
  { id: 'MED-004', name: 'Amoxicillin', form: 'capsule', strength: '500 mg', quantity: 900 },
  { id: 'MED-005', name: 'Azithromycin', form: 'tablet', strength: '250 mg', quantity: 700 },
  { id: 'MED-006', name: 'Metformin', form: 'tablet', strength: '500 mg', quantity: 1200 },
  { id: 'MED-007', name: 'Atorvastatin', form: 'tablet', strength: '10 mg', quantity: 1000 },
  { id: 'MED-008', name: 'Amlodipine', form: 'tablet', strength: '5 mg', quantity: 1100 },
  { id: 'MED-009', name: 'Pantoprazole', form: 'tablet', strength: '40 mg', quantity: 950 },
  { id: 'MED-010', name: 'Ondansetron', form: 'injection', strength: '4 mg', quantity: 300 },
  { id: 'MED-011', name: 'Morphine', form: 'injection', strength: '10 mg', quantity: 120 },
  { id: 'MED-012', name: 'Adrenaline', form: 'injection', strength: '1 mg', quantity: 180 },
  { id: 'MED-013', name: 'Salbutamol', form: 'syrup', strength: '2 mg/5 ml', quantity: 400 },
  { id: 'MED-014', name: 'ORS', form: 'syrup', strength: '200 ml', quantity: 600 },
  { id: 'MED-015', name: 'Ceftriaxone', form: 'infusion', strength: '1 g', quantity: 260 },
  { id: 'MED-016', name: 'Insulin Regular', form: 'injection', strength: '100 IU/ml', quantity: 150 },
  { id: 'MED-017', name: 'Dexamethasone', form: 'injection', strength: '4 mg', quantity: 220 },
  { id: 'MED-018', name: 'Normal Saline', form: 'infusion', strength: '500 ml', quantity: 800 },
];

const USERS = [
  { id: 'USR-ADM', username: 'admin', password: 'Admin@123', name: 'System Administrator', email: 'admin@medagentx.health', phone: '+1-555-0001', role: 'admin' },
  { id: 'USR-REC', username: 'reception', password: 'Reception@123', name: 'Rachel Greene', email: 'rachel.greene@medagentx.health', phone: '+1-555-0301', role: 'reception', staff_id: 'STF-006' },
  { id: 'USR-WRD', username: 'ward', password: 'Ward@123', name: 'Nurse Emily Carter', email: 'emily.carter@medagentx.health', phone: '+1-555-0201', role: 'ward_staff', staff_id: 'STF-001' },
  { id: 'USR-DOC1', username: 'dr.arjun', password: 'Doctor@123', name: 'Dr. Arjun Mehta', email: 'arjun.mehta@medagentx.health', phone: '+1-555-0101', role: 'doctor', doctor_id: 'DOC-001' },
  { id: 'USR-DOC2', username: 'dr.priya', password: 'Doctor@123', name: 'Dr. Priya Nair', email: 'priya.nair@medagentx.health', phone: '+1-555-0102', role: 'doctor', doctor_id: 'DOC-002' },
  { id: 'USR-DOC8', username: 'dr.meera', password: 'Doctor@123', name: 'Dr. Meera Joshi', email: 'meera.joshi@medagentx.health', phone: '+1-555-0108', role: 'doctor', doctor_id: 'DOC-008' },
  { id: 'USR-DOC4', username: 'dr.sneha', password: 'Doctor@123', name: 'Dr. Sneha Kapoor', email: 'sneha.kapoor@medagentx.health', phone: '+1-555-0104', role: 'doctor', doctor_id: 'DOC-004' },
  { id: 'USR-DOC6', username: 'dr.ananya', password: 'Doctor@123', name: 'Dr. Ananya Iyer', email: 'ananya.iyer@medagentx.health', phone: '+1-555-0106', role: 'doctor', doctor_id: 'DOC-006' },
  { id: 'USR-DOC7', username: 'dr.karan', password: 'Doctor@123', name: 'Dr. Karan Shah', email: 'karan.shah@medagentx.health', phone: '+1-555-0107', role: 'doctor', doctor_id: 'DOC-007' },
  { id: 'USR-PHR', username: 'pharmacy', password: 'Pharmacy@123', name: 'Pharmacist Maya Lin', email: 'maya.lin@medagentx.health', phone: '+1-555-0401', role: 'pharmacist', staff_id: 'STF-008' },
];

// Doctor OPD schedules: weekdays (Mon–Fri), morning & afternoon shifts.
const SHIFTS = ['morning', 'afternoon', 'evening'];
const DOCTOR_SCHEDULES = (() => {
  const rows = [];
  for (const doc of DOCTORS) {
    for (let day = 1; day <= 5; day += 1) {
      rows.push({ doctor_id: doc.id, day_of_week: day, shift: 'morning', max_patients: 10 });
      rows.push({ doctor_id: doc.id, day_of_week: day, shift: 'afternoon', max_patients: 8 });
    }
  }
  return rows;
})();

const TRANSACTIONAL_TABLES = [
  'prescription_items',
  'prescriptions',
  'admissions',
  'appointments',
  'alerts',
  'activity_logs',
  'patients',
  'emergencies',
];

const MASTER_TABLES = [
  'users',
  'staff',
  'doctor_schedules',
  'doctors',
  'beds',
  'wards',
  'departments',
  'medicines',
];

function clearTables(tables) {
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
}

export function seed({ reset = false } = {}) {
  initSchema();

  if (reset) {
    clearTables(TRANSACTIONAL_TABLES);
    clearTables(MASTER_TABLES);
  }

  const existing = get('SELECT COUNT(*) AS c FROM departments');
  if (existing.c > 0 && !reset) {
    console.log('Master data already present. Use --reset to reseed from scratch.');
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const ts = now();

    for (const d of DEPARTMENTS) {
      run(
        `INSERT OR REPLACE INTO departments (id, name, code, description, created_at) VALUES (?,?,?,?,?)`,
        d.id, d.name, d.code, d.description, ts
      );
    }

    for (const w of WARDS) {
      run(
        `INSERT OR REPLACE INTO wards (id, name, type, floor, description, created_at) VALUES (?,?,?,?,?,?)`,
        w.id, w.name, w.type, w.floor, w.description, ts
      );
    }

    let bedSeq = 1;
    for (const b of BEDS) {
      const id = `BED-${String(bedSeq).padStart(3, '0')}`;
      run(
        `INSERT OR REPLACE INTO beds (id, ward_id, bed_number, bed_type, status, updated_at) VALUES (?,?,?,?,?,?)`,
        id, b.ward_id, b.bed_number, b.bed_type, b.status, ts
      );
      bedSeq += 1;
    }

    for (const d of DOCTORS) {
      run(
        `INSERT OR REPLACE INTO doctors (id, name, specialization, department_id, availability, current_status, email, phone, room, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        d.id, d.name, d.specialization, d.department_id, d.availability, d.current_status,
        d.email, d.phone, d.room, ts
      );
    }

    for (const s of STAFF) {
      run(
        `INSERT OR REPLACE INTO staff (id, name, role, ward_id, status, email, phone, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        s.id, s.name, s.role, s.ward_id, s.status, s.email, s.phone, ts
      );
    }

    let schedSeq = 1;
    for (const sc of DOCTOR_SCHEDULES) {
      run(
        `INSERT OR REPLACE INTO doctor_schedules (id, doctor_id, day_of_week, shift, max_patients, active, created_at)
         VALUES (?,?,?,?,?,1,?)`,
        `SCH-${String(schedSeq).padStart(4, '0')}`, sc.doctor_id, sc.day_of_week, sc.shift, sc.max_patients, ts
      );
      schedSeq += 1;
    }

    for (const m of MEDICINES) {
      run(
        `INSERT OR REPLACE INTO medicines (id, name, form, strength, quantity, created_at)
         VALUES (?,?,?,?,?,?)`,
        m.id, m.name, m.form, m.strength, m.quantity, ts
      );
    }

    for (const u of USERS) {
      run(
        `INSERT OR REPLACE INTO users (id, username, password_hash, name, email, phone, role, doctor_id, staff_id, active, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,1,?)`,
        u.id, u.username, pw(u.password), u.name, u.email, u.phone, u.role,
        u.doctor_id || null, u.staff_id || null, ts
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log('Seed complete.');
  console.log(`  departments: ${DEPARTMENTS.length}`);
  console.log(`  wards:       ${WARDS.length}`);
  console.log(`  beds:        ${BEDS.length}`);
  console.log(`  doctors:     ${DOCTORS.length}`);
  console.log(`  staff:       ${STAFF.length}`);
  console.log(`  schedules:   ${DOCTOR_SCHEDULES.length}`);
  console.log(`  medicines:   ${MEDICINES.length}`);
  console.log(`  users:       ${USERS.length}`);
  console.log('  patients:    0 (created only via registration/admission workflow)');
  console.log('\nDemo logins:');
  console.log('  admin      / Admin@123');
  console.log('  reception  / Reception@123');
  console.log('  ward       / Ward@123');
  console.log('  pharmacy   / Pharmacy@123');
  console.log('  dr.arjun   / Doctor@123  (Emergency Medicine)');
  console.log('  dr.priya   / Doctor@123  (Cardiology)');
}

export const DEMO_USERS = USERS.map((u) => ({ username: u.username, password: u.password, role: u.role, name: u.name }));

if (import.meta.url === `file://${process.argv[1]}`) {
  const reset = process.argv.includes('--reset');
  seed({ reset });
}

export { randomUUID };
export {
  DEPARTMENTS,
  WARDS,
  BEDS,
  DOCTORS,
  STAFF,
  MEDICINES,
  USERS,
};
