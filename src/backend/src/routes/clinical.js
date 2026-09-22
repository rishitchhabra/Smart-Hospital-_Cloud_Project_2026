import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate, requirePermission, requireAnyPermission } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { nowIso, newId, logActivity, parseJson } from '../utils.js';
import { releaseBed } from '../agents/bedAllocationAgent.js';
import { releaseDoctor } from '../agents/doctorAssignmentAgent.js';
import { createAlert } from '../utils.js';

const router = Router();

const FREQUENCY_SCHEDULES = [
  { match: /(1-0-1|twice|bd|b\.d|two times|2 times)/i, times: ['Morning', 'Night'], label: 'Twice daily' },
  { match: /(1-1-1|thrice|tds|t\.d\.s|three times|3 times)/i, times: ['Morning', 'Afternoon', 'Night'], label: 'Three times daily' },
  { match: /(1-0-0|once|od|o\.d|morning|daily)/i, times: ['Morning'], label: 'Once daily' },
  { match: /(0-0-1|night|hs|bedtime)/i, times: ['Night'], label: 'Once at night' },
  { match: /(sos|as needed|prn|when required)/i, times: ['As needed'], label: 'As needed' },
  { match: /(q6h|every 6)/i, times: ['06:00', '12:00', '18:00', '00:00'], label: 'Every 6 hours' },
  { match: /(q8h|every 8)/i, times: ['06:00', '14:00', '22:00'], label: 'Every 8 hours' },
  { match: /(stat|immediately|now)/i, times: ['Immediately'], label: 'STAT' },
];

function scheduleFor(frequency = '') {
  for (const f of FREQUENCY_SCHEDULES) {
    if (f.match.test(frequency)) return { label: f.label, times: f.times, text: f.times.join(', ') };
  }
  return { label: frequency || 'As directed', times: ['As directed'], text: 'As directed' };
}

function isAssignedDoctor(doctorId, patientId) {
  return Boolean(
    get('SELECT 1 AS x FROM admissions WHERE patient_id = ? AND doctor_id = ? LIMIT 1', patientId, doctorId) ||
      get('SELECT 1 AS x FROM emergencies WHERE patient_id = ? AND doctor_id = ? LIMIT 1', patientId, doctorId) ||
      get('SELECT 1 AS x FROM appointments WHERE patient_id = ? AND doctor_id = ? LIMIT 1', patientId, doctorId)
  );
}

/** Doctor: create a prescription (with clinical notes + medicine items). */
router.post(
  '/prescriptions',
  authenticate,
  requirePermission(P.PRESCRIPTION_WRITE, P.CLINICAL_WRITE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['patientId', 'items']);
    const { patientId, diagnosis, clinicalNotes, admissionId, items } = req.body;

    const patient = get('SELECT * FROM patients WHERE id = ?', patientId);
    if (!patient) throw new HttpError(404, 'Patient not found');
    if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, 'At least one medicine is required');
    if (!isAssignedDoctor(req.user.doctorId, patientId)) {
      throw new HttpError(403, 'You are not the assigned doctor for this patient');
    }

    const id = newId('RX');
    const ts = nowIso();
    const source = patient.emergency_id ? 'emergency' : 'opd';
    run(
      `INSERT INTO prescriptions (id, patient_id, doctor_id, admission_id, diagnosis, clinical_notes, status, fulfillment_status, source, created_at)
       VALUES (?,?,?,?,?,?, 'active', 'pending', ?, ?)`,
      id,
      patientId,
      req.user.doctorId,
      admissionId || get('SELECT id FROM admissions WHERE patient_id = ? LIMIT 1', patientId)?.id || null,
      diagnosis || null,
      clinicalNotes || null,
      source,
      ts
    );

    for (const item of items) {
      requireFields(item, ['medicineName', 'dosage', 'frequency', 'duration']);
      run(
        `INSERT INTO prescription_items (id, prescription_id, medicine_id, medicine_name, dosage, frequency, duration, before_after_food, instructions)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        newId('RXI'),
        id,
        item.medicineId || null,
        item.medicineName,
        item.dosage,
        item.frequency,
        item.duration,
        item.beforeAfterFood || null,
        item.instructions || null
      );
    }

    // Update admission treatment status and mark patient under treatment.
    const admission = get('SELECT * FROM admissions WHERE patient_id = ? ORDER BY datetime(admitted_at) DESC LIMIT 1', patientId);
    if (admission && admission.status === 'admitted') {
      run(`UPDATE admissions SET status = 'under_treatment' WHERE id = ?`, admission.id);
    }

    createAlert({
      type: 'system',
      severity: 'info',
      recipientRole: 'patient',
      recipientId: get('SELECT id FROM users WHERE patient_id = ?', patientId)?.id || null,
      patientId,
      title: 'New prescription added',
      message: `Your doctor added a new prescription. Please check your medicine schedule.`,
      payload: { prescriptionId: id },
    });

    createAlert({
      type: 'pharmacy',
      severity: source === 'emergency' ? 'warning' : 'info',
      recipientRole: 'pharmacist',
      recipientId: null,
      patientId,
      emergencyId: patient.emergency_id || null,
      title: `Prepare medicines · ${patient.name}`,
      message:
        `${source === 'emergency' ? 'EMERGENCY prescription' : 'Prescription'} ${id} for ${patient.name} (${patientId}).\n` +
        `${items.length} medicine(s) to prepare.\nDiagnosis: ${diagnosis || '—'}`,
      payload: { prescriptionId: id, emergency: source === 'emergency' },
    });

    logActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'PRESCRIPTION_CREATED',
      entity: 'prescription',
      entityId: id,
      details: { patientId, itemCount: items.length },
    });

    res.status(201).json({ prescriptionId: id, prescriptions: getPrescriptions(patientId) });
  })
);

function getPrescriptions(patientId) {
  const list = all(
    `SELECT p.*, d.name AS doctor_name, d.specialization FROM prescriptions p
       LEFT JOIN doctors d ON d.id = p.doctor_id
      WHERE p.patient_id = ? ORDER BY datetime(p.created_at) DESC`,
    patientId
  );
  return list.map((p) => ({
    ...p,
    items: all('SELECT * FROM prescription_items WHERE prescription_id = ?', p.id).map((it) => {
      const med = it.medicine_id ? get('SELECT * FROM medicines WHERE id = ?', it.medicine_id) : null;
      return { ...it, schedule: scheduleFor(it.frequency), medicine: med };
    }),
  }));
}

router.get(
  '/prescriptions',
  authenticate,
  requireAnyPermission(P.PRESCRIPTION_READ, P.PRESCRIPTION_READ_SELF),
  asyncHandler((req, res) => {
    const patientId = req.user.role === 'patient' ? req.user.patientId : req.query.patientId;
    if (!patientId) throw new HttpError(400, 'patientId is required');
    if (req.user.role === 'patient' && req.query.patientId && req.query.patientId !== req.user.patientId) {
      throw new HttpError(403, 'You can only view your own prescriptions');
    }
    res.json({ prescriptions: getPrescriptions(patientId) });
  })
);

/** Doctor: add free-text clinical note without a full prescription. */
router.post(
  '/clinical-notes',
  authenticate,
  requirePermission(P.CLINICAL_WRITE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['patientId', 'note']);
    const { patientId, note, diagnosis } = req.body;
    if (!isAssignedDoctor(req.user.doctorId, patientId)) {
      throw new HttpError(403, 'You are not the assigned doctor for this patient');
    }
    const id = newId('NOTE');
    run(
      `INSERT INTO prescriptions (id, patient_id, doctor_id, admission_id, diagnosis, clinical_notes, status, created_at)
       VALUES (?,?,?,?,?,?, 'note', ?)`,
      id,
      patientId,
      req.user.doctorId,
      get('SELECT id FROM admissions WHERE patient_id = ? LIMIT 1', patientId)?.id || null,
      diagnosis || null,
      note,
      nowIso()
    );
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'CLINICAL_NOTE_ADDED', entity: 'patient', entityId: patientId });
    res.status(201).json({ noteId: id });
  })
);

/** Admissions listing scoped by role. */
router.get(
  '/admissions',
  authenticate,
  requirePermission(P.ADMISSION_READ),
  asyncHandler((req, res) => {
    const select = `SELECT a.*, p.name AS patient_name, p.age, p.gender, w.name AS ward_name,
                           b.bed_number, d.name AS doctor_name
                      FROM admissions a
                      LEFT JOIN patients p ON p.id = a.patient_id
                      LEFT JOIN wards w ON w.id = a.ward_id
                      LEFT JOIN beds b ON b.id = a.bed_id
                      LEFT JOIN doctors d ON d.id = a.doctor_id`;
    let rows;
    if (req.user.role === 'doctor') {
      rows = all(`${select} WHERE a.doctor_id = ? ORDER BY datetime(a.admitted_at) DESC`, req.user.doctorId);
    } else if (req.user.role === 'patient') {
      rows = all(`${select} WHERE a.patient_id = ? ORDER BY datetime(a.admitted_at) DESC`, req.user.patientId);
    } else if (req.user.role === 'ward_staff') {
      const staff = get('SELECT * FROM staff WHERE id = ?', req.user.staffId);
      rows = all(
        `${select} WHERE (? IS NULL OR a.ward_id = ?) ORDER BY datetime(a.admitted_at) DESC`,
        staff?.ward_id || null,
        staff?.ward_id || null
      );
    } else {
      rows = all(`${select} ORDER BY datetime(a.admitted_at) DESC LIMIT 200`);
    }
    res.json({ admissions: rows });
  })
);

/** Doctor/admin: update treatment status; discharge frees bed + doctor. */
router.patch(
  '/admissions/:id/status',
  authenticate,
  requirePermission(P.TREATMENT_UPDATE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['status']);
    const allowed = ['admitted', 'under_treatment', 'discharged'];
    if (!allowed.includes(req.body.status)) throw new HttpError(400, `status must be one of ${allowed.join(', ')}`);

    const admission = get('SELECT * FROM admissions WHERE id = ?', req.params.id);
    if (!admission) throw new HttpError(404, 'Admission not found');
    if (req.user.role === 'doctor' && admission.doctor_id !== req.user.doctorId) {
      throw new HttpError(403, 'Not your patient');
    }

    run(
      `UPDATE admissions SET status = ?, discharged_at = ? WHERE id = ?`,
      req.body.status,
      req.body.status === 'discharged' ? nowIso() : null,
      admission.id
    );

    if (req.body.status === 'discharged') {
      releaseBed(admission.bed_id);
      releaseDoctor(admission.doctor_id);
      const emergency = admission.emergency_id ? get('SELECT * FROM emergencies WHERE id = ?', admission.emergency_id) : null;
      if (emergency && emergency.doctor_id) releaseDoctor(emergency.doctor_id);
    }

    logActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'ADMISSION_STATUS_UPDATED',
      entity: 'admission',
      entityId: admission.id,
      details: { status: req.body.status },
    });

    res.json({ admission: get('SELECT * FROM admissions WHERE id = ?', admission.id) });
  })
);

export default router;
export { scheduleFor, getPrescriptions };
