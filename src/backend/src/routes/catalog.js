import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate, requirePermission, requireAnyPermission, requireRole } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { nowIso, newId, logActivity } from '../utils.js';

const router = Router();

const BED_STATUSES = ['available', 'reserved', 'occupied', 'cleaning', 'maintenance'];

// Patients must not browse hospital directories; staff roles may.
const staffOnly = requireRole('admin', 'reception', 'ward_staff', 'doctor', 'pharmacist');

/* --------------------------------- Beds --------------------------------- */

router.get(
  '/beds',
  authenticate,
  requirePermission(P.BED_READ),
  asyncHandler((req, res) => {
    const beds = all(
      `SELECT b.*, w.name AS ward_name, w.type AS ward_type, w.floor
         FROM beds b JOIN wards w ON w.id = b.ward_id
        ORDER BY w.name, b.bed_number`
    );
    const inventory = all(
      `SELECT w.id AS ward_id, w.name AS ward_name, w.type AS ward_type,
              SUM(CASE WHEN b.status = 'available' THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN b.status = 'reserved' THEN 1 ELSE 0 END) AS reserved,
              SUM(CASE WHEN b.status IN ('cleaning','maintenance') THEN 1 ELSE 0 END) AS unavailable,
              COUNT(*) AS total
         FROM wards w LEFT JOIN beds b ON b.ward_id = w.id
        GROUP BY w.id ORDER BY w.name`
    );
    res.json({ beds, inventory });
  })
);

router.patch(
  '/beds/:id',
  authenticate,
  requirePermission(P.BED_UPDATE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['status']);
    if (!BED_STATUSES.includes(req.body.status)) {
      throw new HttpError(400, `status must be one of ${BED_STATUSES.join(', ')}`);
    }
    const bed = get('SELECT * FROM beds WHERE id = ?', req.params.id);
    if (!bed) throw new HttpError(404, 'Bed not found');

    const clearing = ['available', 'cleaning', 'maintenance'].includes(req.body.status)
      ? 'current_emergency_id = NULL,'
      : '';
    run(
      `UPDATE beds SET status = ?, ${clearing} updated_at = ? WHERE id = ?`,
      req.body.status,
      nowIso(),
      bed.id
    );
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'BED_STATUS_UPDATED', entity: 'bed', entityId: bed.id, details: { status: req.body.status } });
    res.json({ bed: get('SELECT * FROM beds WHERE id = ?', bed.id) });
  })
);

router.post(
  '/beds',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['wardId', 'bedNumber', 'bedType']);
    const id = newId('BED');
    run(
      `INSERT INTO beds (id, ward_id, bed_number, bed_type, status, updated_at) VALUES (?,?,?,?,?,?)`,
      id,
      req.body.wardId,
      req.body.bedNumber,
      req.body.bedType,
      req.body.status || 'available',
      nowIso()
    );
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'BED_CREATED', entity: 'bed', entityId: id });
    res.status(201).json({ bed: get('SELECT * FROM beds WHERE id = ?', id) });
  })
);

router.delete(
  '/beds/:id',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    const bed = get('SELECT * FROM beds WHERE id = ?', req.params.id);
    if (!bed) throw new HttpError(404, 'Bed not found');
    run('DELETE FROM beds WHERE id = ?', bed.id);
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'BED_DELETED', entity: 'bed', entityId: bed.id });
    res.json({ ok: true });
  })
);

/* -------------------------------- Wards --------------------------------- */

router.get(
  '/wards',
  authenticate,
  staffOnly,
  asyncHandler((req, res) => {
    res.json({ wards: all('SELECT * FROM wards ORDER BY name') });
  })
);

router.post(
  '/wards',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['name', 'type']);
    const id = newId('WRD');
    run(
      `INSERT INTO wards (id, name, type, floor, description, created_at) VALUES (?,?,?,?,?,?)`,
      id, req.body.name, req.body.type, req.body.floor || null, req.body.description || null, nowIso()
    );
    res.status(201).json({ ward: get('SELECT * FROM wards WHERE id = ?', id) });
  })
);

/* ----------------------------- Departments ------------------------------ */

router.get(
  '/departments',
  authenticate,
  staffOnly,
  asyncHandler((req, res) => {
    res.json({ departments: all('SELECT * FROM departments ORDER BY name') });
  })
);

router.post(
  '/departments',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['name', 'code']);
    const id = newId('DEP');
    run(
      `INSERT INTO departments (id, name, code, description, created_at) VALUES (?,?,?,?,?)`,
      id, req.body.name, req.body.code.toUpperCase(), req.body.description || null, nowIso()
    );
    res.status(201).json({ department: get('SELECT * FROM departments WHERE id = ?', id) });
  })
);

/* -------------------------------- Doctors ------------------------------- */

router.get(
  '/doctors',
  authenticate,
  staffOnly,
  asyncHandler((req, res) => {
    res.json({
      doctors: all(
        `SELECT d.*, dep.name AS department_name FROM doctors d
           LEFT JOIN departments dep ON dep.id = d.department_id
          ORDER BY dep.name, d.name`
      ),
    });
  })
);

router.patch(
  '/doctors/:id/availability',
  authenticate,
  requireAnyPermission(P.HOSPITAL_MANAGE, P.TREATMENT_UPDATE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['availability']);
    const allowed = ['available', 'busy', 'off_duty'];
    if (!allowed.includes(req.body.availability)) throw new HttpError(400, 'Invalid availability');
    const doctor = get('SELECT * FROM doctors WHERE id = ?', req.params.id);
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    run(
      `UPDATE doctors SET availability = ?, current_status = ? WHERE id = ?`,
      req.body.availability,
      req.body.currentStatus || doctor.current_status,
      doctor.id
    );
    res.json({ doctor: get('SELECT * FROM doctors WHERE id = ?', doctor.id) });
  })
);

/** Doctor self-service duty toggle: on duty (available) / off duty. */
router.patch(
  '/doctors/me/duty',
  authenticate,
  requirePermission(P.DOCTOR_DUTY),
  asyncHandler((req, res) => {
    requireFields(req.body, ['onDuty']);
    const doctor = get('SELECT * FROM doctors WHERE id = ?', req.user.doctorId);
    if (!doctor) throw new HttpError(404, 'Doctor profile not found');
    const onDuty = Boolean(req.body.onDuty);
    run(
      `UPDATE doctors SET availability = ?, current_status = ? WHERE id = ?`,
      onDuty ? 'available' : 'off_duty',
      onDuty ? 'On duty' : 'Off duty',
      doctor.id
    );
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: onDuty ? 'DOCTOR_ON_DUTY' : 'DOCTOR_OFF_DUTY', entity: 'doctor', entityId: doctor.id });
    res.json({ doctor: get('SELECT * FROM doctors WHERE id = ?', doctor.id) });
  })
);

/** Weekly OPD schedule for a doctor. */
router.get(
  '/doctors/:id/schedule',
  authenticate,
  staffOnly,
  asyncHandler((req, res) => {
    res.json({
      schedule: all(
        `SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week, shift`,
        req.params.id
      ),
    });
  })
);

/** Admin: add or update a schedule slot (unique per doctor/day/shift). */
router.post(
  '/doctors/:id/schedule',
  authenticate,
  requirePermission(P.SCHEDULE_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['dayOfWeek', 'shift']);
    const doctor = get('SELECT * FROM doctors WHERE id = ?', req.params.id);
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    const day = Number(req.body.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw new HttpError(400, 'dayOfWeek must be 0-6');
    if (!['morning', 'afternoon', 'evening'].includes(req.body.shift)) throw new HttpError(400, 'Invalid shift');
    const maxPatients = Number(req.body.maxPatients || 10);

    const existing = get(
      `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND shift = ?`,
      doctor.id, day, req.body.shift
    );
    if (existing) {
      run(`UPDATE doctor_schedules SET max_patients = ?, active = 1 WHERE id = ?`, maxPatients, existing.id);
    } else {
      run(
        `INSERT INTO doctor_schedules (id, doctor_id, day_of_week, shift, max_patients, active, created_at)
         VALUES (?,?,?,?,?,1,?)`,
        newId('SCH'), doctor.id, day, req.body.shift, maxPatients, nowIso()
      );
    }
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'DOCTOR_SCHEDULE_SAVED', entity: 'doctor', entityId: doctor.id });
    res.status(201).json({ schedule: all(`SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY day_of_week, shift`, doctor.id) });
  })
);

router.delete(
  '/doctor-schedule/:id',
  authenticate,
  requirePermission(P.SCHEDULE_MANAGE),
  asyncHandler((req, res) => {
    run('DELETE FROM doctor_schedules WHERE id = ?', req.params.id);
    res.json({ ok: true });
  })
);

router.post(
  '/doctors',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['name', 'specialization', 'departmentId']);
    const id = newId('DOC');
    run(
      `INSERT INTO doctors (id, name, specialization, department_id, availability, current_status, email, phone, room, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id, req.body.name, req.body.specialization, req.body.departmentId,
      req.body.availability || 'available', req.body.currentStatus || 'On shift',
      req.body.email || null, req.body.phone || null, req.body.room || null, nowIso()
    );
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'DOCTOR_CREATED', entity: 'doctor', entityId: id });
    res.status(201).json({ doctor: get('SELECT * FROM doctors WHERE id = ?', id) });
  })
);

/* --------------------------------- Staff -------------------------------- */

router.get(
  '/staff',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    res.json({
      staff: all(
        `SELECT s.*, w.name AS ward_name FROM staff s LEFT JOIN wards w ON w.id = s.ward_id ORDER BY s.role, s.name`
      ),
    });
  })
);

router.post(
  '/staff',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['name', 'role']);
    const id = newId('STF');
    run(
      `INSERT INTO staff (id, name, role, ward_id, status, email, phone, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      id, req.body.name, req.body.role, req.body.wardId || null, req.body.status || 'on_duty',
      req.body.email || null, req.body.phone || null, nowIso()
    );
    res.status(201).json({ staff: get('SELECT * FROM staff WHERE id = ?', id) });
  })
);

/* ------------------------------- Medicines ------------------------------ */

router.get(
  '/medicines',
  authenticate,
  staffOnly,
  asyncHandler((req, res) => {
    res.json({ medicines: all('SELECT * FROM medicines ORDER BY name') });
  })
);

router.post(
  '/medicines',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['name', 'form']);
    const id = newId('MED');
    run(
      `INSERT INTO medicines (id, name, form, strength, quantity, created_at) VALUES (?,?,?,?,?,?)`,
      id, req.body.name, req.body.form, req.body.strength || null, req.body.quantity || 0, nowIso()
    );
    res.status(201).json({ medicine: get('SELECT * FROM medicines WHERE id = ?', id) });
  })
);

router.patch(
  '/medicines/:id',
  authenticate,
  requirePermission(P.HOSPITAL_MANAGE),
  asyncHandler((req, res) => {
    const med = get('SELECT * FROM medicines WHERE id = ?', req.params.id);
    if (!med) throw new HttpError(404, 'Medicine not found');
    run(
      `UPDATE medicines SET name = ?, form = ?, strength = ?, quantity = ? WHERE id = ?`,
      req.body.name ?? med.name,
      req.body.form ?? med.form,
      req.body.strength ?? med.strength,
      req.body.quantity ?? med.quantity,
      med.id
    );
    res.json({ medicine: get('SELECT * FROM medicines WHERE id = ?', med.id) });
  })
);

export default router;
