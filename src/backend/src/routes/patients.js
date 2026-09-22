import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run } from '../db.js';
import { authenticate, requireAnyPermission, requirePermission, requireRole } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { nowIso, logActivity, newId, newPatientId, newAccessCode, createAlert } from '../utils.js';
import { scheduleFor } from './clinical.js';

const router = Router();

function prescriptionsFor(patientId) {
  const list = all(
    `SELECT p.*, d.name AS doctor_name, d.specialization
       FROM prescriptions p LEFT JOIN doctors d ON d.id = p.doctor_id
      WHERE p.patient_id = ? ORDER BY datetime(p.created_at) DESC`,
    patientId
  );
  return list.map((p) => ({
    ...p,
    items: all('SELECT * FROM prescription_items WHERE prescription_id = ?', p.id).map((it) => ({
      ...it,
      schedule: scheduleFor(it.frequency),
      medicine: it.medicine_id ? get('SELECT * FROM medicines WHERE id = ?', it.medicine_id) : null,
    })),
  }));
}

function admissionFor(patientId) {
  const admission = get(
    `SELECT a.*, w.name AS ward_name, w.type AS ward_type, b.bed_number, d.name AS doctor_name,
            d.specialization, d.phone AS doctor_phone
       FROM admissions a
       LEFT JOIN wards w ON w.id = a.ward_id
       LEFT JOIN beds b ON b.id = a.bed_id
       LEFT JOIN doctors d ON d.id = a.doctor_id
      WHERE a.patient_id = ? ORDER BY datetime(a.admitted_at) DESC LIMIT 1`,
    patientId
  );
  return admission || null;
}

function buildPatient(row, { includeClinical = true } = {}) {
  if (!row) return null;
  const admission = admissionFor(row.id);
  const emergency = row.emergency_id ? get('SELECT * FROM emergencies WHERE id = ?', row.emergency_id) : null;
  const base = {
    ...row,
    admission,
    emergency: emergency
      ? {
          id: emergency.id,
          status: emergency.status,
          urgency: emergency.urgency,
          triageLevel: emergency.triage_level,
          summary: emergency.summary,
          requiredDepartment: emergency.required_department,
          timestamps: JSON.parse(emergency.timestamps || '{}'),
        }
      : null,
  };
  if (includeClinical) {
    base.prescriptions = prescriptionsFor(row.id);
  }
  return base;
}

function assignedDoctorIdsForPatient(patientId) {
  const admission = get('SELECT doctor_id FROM admissions WHERE patient_id = ? LIMIT 1', patientId);
  const emergency = get('SELECT doctor_id FROM emergencies WHERE patient_id = ? LIMIT 1', patientId);
  const appointments = all('SELECT DISTINCT doctor_id FROM appointments WHERE patient_id = ?', patientId);
  return [admission?.doctor_id, emergency?.doctor_id, ...appointments.map((a) => a.doctor_id)].filter(Boolean);
}

function assertCanRead(user, patient) {
  if (user.role === 'admin' || user.role === 'reception') return;
  if (user.role === 'doctor') {
    const ids = assignedDoctorIdsForPatient(patient.id);
    if (!ids.includes(user.doctorId)) throw new HttpError(403, 'Not assigned to this patient');
    return;
  }
  if (user.role === 'ward_staff') {
    const admission = admissionFor(patient.id);
    const staff = get('SELECT * FROM staff WHERE id = ?', user.staffId);
    if (admission && staff?.ward_id && admission.ward_id !== staff.ward_id) {
      throw new HttpError(403, 'Patient is not in your ward');
    }
    return;
  }
  if (user.role === 'patient') {
    if (patient.id !== user.patientId) throw new HttpError(403, 'You can only view your own record');
    return;
  }
  throw new HttpError(403, 'Forbidden');
}

/** List patients (reception, admin, doctor, ward_staff). */
router.get(
  '/',
  authenticate,
  requireAnyPermission(P.PATIENT_READ, P.PATIENT_READ_ASSIGNED),
  asyncHandler((req, res) => {
    let rows;
    if (req.user.role === 'doctor') {
      rows = all(
        `SELECT DISTINCT p.* FROM patients p
           LEFT JOIN admissions a ON a.patient_id = p.id
           LEFT JOIN emergencies e ON e.patient_id = p.id
           LEFT JOIN appointments ap ON ap.patient_id = p.id
          WHERE a.doctor_id = ? OR e.doctor_id = ? OR ap.doctor_id = ?
          ORDER BY datetime(p.created_at) DESC`,
        req.user.doctorId,
        req.user.doctorId,
        req.user.doctorId
      );
    } else if (req.user.role === 'ward_staff') {
      const staff = get('SELECT * FROM staff WHERE id = ?', req.user.staffId);
      rows = all(
        `SELECT p.* FROM patients p
           JOIN admissions a ON a.patient_id = p.id
          WHERE (? IS NULL OR a.ward_id = ?)
          ORDER BY datetime(p.created_at) DESC`,
        staff?.ward_id || null,
        staff?.ward_id || null
      );
    } else {
      rows = all('SELECT * FROM patients ORDER BY datetime(created_at) DESC LIMIT 200');
    }
    const includeClinical = req.user.role !== 'reception' && req.user.role !== 'ward_staff';
    res.json({ patients: rows.map((r) => buildPatient(r, { includeClinical })) });
  })
);

/** Patient self-service dashboard. */
router.get(
  '/me',
  authenticate,
  requirePermission(P.PATIENT_READ_SELF),
  asyncHandler((req, res) => {
    const patient = req.user.patientId ? get('SELECT * FROM patients WHERE id = ?', req.user.patientId) : null;
    if (!patient) throw new HttpError(404, 'No patient record linked to this account');
    res.json({
      patient: buildPatient(patient, { includeClinical: true }),
      appointments: all(
        `SELECT a.*, d.name AS doctor_name, d.specialization, dep.name AS department_name
           FROM appointments a
           LEFT JOIN doctors d ON d.id = a.doctor_id
           LEFT JOIN departments dep ON dep.id = a.department_id
          WHERE a.patient_id = ? ORDER BY datetime(a.scheduled_at) DESC`,
        patient.id
      ),
    });
  })
);

/** Reception/admin: register an OPD (outpatient) patient directly. */
router.post(
  '/',
  authenticate,
  requirePermission(P.PATIENT_REGISTER),
  asyncHandler((req, res) => {
    requireFields(req.body, ['name']);
    const d = req.body;
    const patientId = newPatientId();
    const portalCode = newAccessCode();
    const ts = nowIso();

    run(
      `INSERT INTO patients (id, emergency_id, patient_type, name, age, gender, contact, address,
           blood_group, emergency_details, attendant_name, attendant_contact, medical_history,
           allergies, portal_code, created_by, created_at, updated_at)
       VALUES (?, NULL, 'opd', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      patientId,
      d.name,
      d.age ?? null,
      d.gender ?? null,
      d.contact ?? null,
      d.address ?? null,
      d.blood_group ?? null,
      d.emergency_details ?? null,
      d.attendant_name ?? null,
      d.attendant_contact ?? null,
      d.medical_history ?? null,
      d.allergies ?? null,
      portalCode,
      req.user.id,
      ts,
      ts
    );

    run(
      `INSERT INTO users (id, username, password_hash, name, email, phone, role, patient_id, active, created_at)
       VALUES (?,?,?,?,?,?, 'patient', ?, 1, ?)`,
      `USR-${patientId}`,
      patientId.toLowerCase(),
      bcrypt.hashSync(portalCode, 10),
      d.name,
      d.contact ?? null,
      d.contact ?? null,
      patientId,
      ts
    );

    logActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'PATIENT_REGISTERED_OPD',
      entity: 'patient',
      entityId: patientId,
    });

    res.status(201).json({
      patient: buildPatient(get('SELECT * FROM patients WHERE id = ?', patientId), { includeClinical: true }),
      patientLogin: { username: patientId.toLowerCase(), password: portalCode, portalCode },
    });
  })
);

router.get(
  '/:id',
  authenticate,
  requireAnyPermission(P.PATIENT_READ, P.PATIENT_READ_ASSIGNED, P.PATIENT_READ_SELF),
  asyncHandler((req, res) => {
    const patient = get('SELECT * FROM patients WHERE id = ?', req.params.id);
    if (!patient) throw new HttpError(404, 'Patient not found');
    assertCanRead(req.user, patient);
    const includeClinical = !['reception', 'ward_staff'].includes(req.user.role);
    res.json({ patient: buildPatient(patient, { includeClinical }) });
  })
);

router.get(
  '/:id/prescriptions',
  authenticate,
  requireAnyPermission(P.PRESCRIPTION_READ, P.PRESCRIPTION_READ_SELF, P.PATIENT_READ),
  asyncHandler((req, res) => {
    const patient = get('SELECT * FROM patients WHERE id = ?', req.params.id);
    if (!patient) throw new HttpError(404, 'Patient not found');
    assertCanRead(req.user, patient);
    res.json({ prescriptions: prescriptionsFor(patient.id), admission: admissionFor(patient.id) });
  })
);

/** Reception/admin/assigned doctor: update non-clinical demographics. */
router.patch(
  '/:id',
  authenticate,
  requireAnyPermission(P.PATIENT_REGISTER, P.PATIENT_READ, P.PATIENT_READ_ASSIGNED),
  asyncHandler((req, res) => {
    const patient = get('SELECT * FROM patients WHERE id = ?', req.params.id);
    if (!patient) throw new HttpError(404, 'Patient not found');

    if (req.user.role === 'doctor') {
      const ids = assignedDoctorIdsForPatient(patient.id);
      if (!ids.includes(req.user.doctorId)) {
        throw new HttpError(403, 'You can only update patients assigned to you');
      }
    }

    const allowed = [
      'name', 'age', 'gender', 'contact', 'address', 'blood_group',
      'attendant_name', 'attendant_contact', 'emergency_details', 'medical_history', 'allergies',
    ];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) throw new HttpError(400, 'No updatable fields supplied');

    values.push(nowIso(), patient.id);
    run(`UPDATE patients SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, ...values);
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'PATIENT_DETAILS_UPDATED', entity: 'patient', entityId: patient.id });
    res.json({ patient: buildPatient(get('SELECT * FROM patients WHERE id = ?', patient.id)) });
  })
);

/** Reception/admin: view a patient's portal login (username + access code). */
router.get(
  '/:id/credentials',
  authenticate,
  requireRole('reception', 'admin'),
  asyncHandler((req, res) => {
    const patient = get('SELECT * FROM patients WHERE id = ?', req.params.id);
    if (!patient) throw new HttpError(404, 'Patient not found');
    const emergency = patient.emergency_id ? get('SELECT access_code FROM emergencies WHERE id = ?', patient.emergency_id) : null;
    const user = get('SELECT username FROM users WHERE patient_id = ?', patient.id);
    res.json({
      patientId: patient.id,
      name: patient.name,
      username: user?.username || patient.id.toLowerCase(),
      accessCode: patient.portal_code || emergency?.access_code || null,
    });
  })
);

/** Reception/admin: issue a fresh access code (e.g. patient lost it). */
router.post(
  '/:id/credentials/reissue',
  authenticate,
  requireRole('reception', 'admin'),
  asyncHandler((req, res) => {
    const patient = get('SELECT * FROM patients WHERE id = ?', req.params.id);
    if (!patient) throw new HttpError(404, 'Patient not found');
    const code = newAccessCode();
    const ts = nowIso();

    run('UPDATE patients SET portal_code = ?, updated_at = ? WHERE id = ?', code, ts, patient.id);
    if (patient.emergency_id) {
      run('UPDATE emergencies SET access_code = ?, updated_at = ? WHERE id = ?', code, ts, patient.emergency_id);
    }
    const user = get('SELECT * FROM users WHERE patient_id = ?', patient.id);
    if (user) {
      run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(code, 10), user.id);
    } else {
      run(
        `INSERT INTO users (id, username, password_hash, name, email, phone, role, patient_id, active, created_at)
         VALUES (?,?,?,?,?,?, 'patient', ?, 1, ?)`,
        `USR-${patient.id}`, patient.id.toLowerCase(), bcrypt.hashSync(code, 10),
        patient.name, patient.contact, patient.contact, patient.id, ts
      );
    }

    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'PATIENT_ACCESS_CODE_REISSUED', entity: 'patient', entityId: patient.id });
    res.json({ patientId: patient.id, name: patient.name, username: patient.id.toLowerCase(), accessCode: code });
  })
);

/** Attach the emergency access code to an existing patient record (idempotent). */
router.post(
  '/:id/record-admission',
  authenticate,
  requireAnyPermission(P.ADMISSION_CREATE, P.EMERGENCY_ADMIT),
  asyncHandler((req, res) => {
    const patient = get('SELECT * FROM patients WHERE id = ?', req.params.id);
    if (!patient) throw new HttpError(404, 'Patient not found');
    res.json({ patient: buildPatient(patient) });
  })
);

export default router;
export { buildPatient, prescriptionsFor, admissionFor };
