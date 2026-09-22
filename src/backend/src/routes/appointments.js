import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate, requireAnyPermission, requirePermission } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { nowIso, newId, logActivity, createAlert } from '../utils.js';

const router = Router();

export const SHIFT_TIMES = { morning: '09:00', afternoon: '14:00', evening: '18:00' };
export const SHIFTS = ['morning', 'afternoon', 'evening'];

const SELECT = `SELECT a.*, p.name AS patient_name, p.contact AS patient_contact,
                       d.name AS doctor_name, d.specialization, dep.name AS department_name
                  FROM appointments a
                  LEFT JOIN patients p ON p.id = a.patient_id
                  LEFT JOIN doctors d ON d.id = a.doctor_id
                  LEFT JOIN departments dep ON dep.id = a.department_id`;

function withShiftTime(dateStr, shift) {
  const time = SHIFT_TIMES[shift] || '09:00';
  return `${dateStr}T${time}:00`;
}

function bookedCount(doctorId, dateStr, shift, excludeId = null) {
  const row = get(
    `SELECT COUNT(*) AS c FROM appointments
      WHERE doctor_id = ? AND shift = ? AND date(scheduled_at) = date(?)
        AND status != 'cancelled' AND (? IS NULL OR id != ?)`,
    doctorId, shift, dateStr, excludeId, excludeId
  );
  return row?.c ?? 0;
}

/** List appointments, scoped by role. */
router.get(
  '/',
  authenticate,
  requireAnyPermission(P.APPOINTMENT_READ, P.APPOINTMENT_READ_SELF),
  asyncHandler((req, res) => {
    let rows;
    if (req.user.role === 'doctor') {
      rows = all(`${SELECT} WHERE a.doctor_id = ? ORDER BY datetime(a.scheduled_at) DESC`, req.user.doctorId);
    } else if (req.user.role === 'patient') {
      rows = all(`${SELECT} WHERE a.patient_id = ? ORDER BY datetime(a.scheduled_at) DESC`, req.user.patientId);
    } else {
      rows = all(`${SELECT} ORDER BY datetime(a.scheduled_at) DESC LIMIT 200`);
    }
    res.json({ appointments: rows });
  })
);

/** Bookable doctors (safe subset) for patients and reception. */
router.get(
  '/doctors',
  authenticate,
  requireAnyPermission(P.APPOINTMENT_READ, P.APPOINTMENT_READ_SELF, P.APPOINTMENT_MANAGE),
  asyncHandler((req, res) => {
    res.json({
      doctors: all(
        `SELECT d.id, d.name, d.specialization, d.availability, d.department_id, dep.name AS department_name
           FROM doctors d LEFT JOIN departments dep ON dep.id = d.department_id
          ORDER BY dep.name, d.name`
      ),
    });
  })
);

/** Slot availability for a doctor on a given date. */
router.get(
  '/availability',
  authenticate,
  requireAnyPermission(P.APPOINTMENT_READ, P.APPOINTMENT_READ_SELF, P.APPOINTMENT_MANAGE),
  asyncHandler((req, res) => {
    const { doctorId } = req.query;
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    if (!doctorId) throw new HttpError(400, 'doctorId is required');
    const doctor = get('SELECT * FROM doctors WHERE id = ?', doctorId);
    if (!doctor) throw new HttpError(404, 'Doctor not found');

    const day = new Date(`${date}T00:00:00`).getDay();
    const schedules = all(
      `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND active = 1 ORDER BY shift`,
      doctorId, day
    );
    const shifts = schedules.map((s) => {
      const booked = bookedCount(doctorId, date, s.shift);
      return {
        shift: s.shift,
        time: SHIFT_TIMES[s.shift],
        maxPatients: s.max_patients,
        booked,
        remaining: Math.max(0, s.max_patients - booked),
      };
    });
    res.json({ doctorId, date, dayOfWeek: day, availability: doctor.availability, shifts });
  })
);

/** Book an appointment (reception/admin for anyone, patient for self). */
router.post(
  '/',
  authenticate,
  requireAnyPermission(P.APPOINTMENT_MANAGE, P.APPOINTMENT_CREATE_SELF),
  asyncHandler((req, res) => {
    const { doctorId, date, shift, reason } = req.body;
    requireFields(req.body, ['doctorId', 'date']);
    if (!SHIFTS.includes(shift)) throw new HttpError(400, 'shift must be morning, afternoon or evening');

    const patientId = req.user.role === 'patient' ? req.user.patientId : req.body.patientId;
    if (!patientId) throw new HttpError(400, 'patientId is required');
    const patient = get('SELECT * FROM patients WHERE id = ?', patientId);
    if (!patient) throw new HttpError(404, 'Patient not found');

    const doctor = get('SELECT * FROM doctors WHERE id = ?', doctorId);
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    if (doctor.availability === 'off_duty') throw new HttpError(409, `${doctor.name} is off duty`);

    const day = new Date(`${date}T00:00:00`).getDay();
    const schedule = get(
      `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND shift = ? AND active = 1`,
      doctorId, day, shift
    );
    if (!schedule) throw new HttpError(409, `No ${shift} OPD on the selected day for ${doctor.name}`);

    const booked = bookedCount(doctorId, date, shift);
    if (booked >= schedule.max_patients) {
      throw new HttpError(409, `${shift} slot is full (${schedule.max_patients} patients)`);
    }

    const id = newId('APT');
    run(
      `INSERT INTO appointments (id, patient_id, doctor_id, department_id, scheduled_at, shift, reason, status, created_by, created_at)
       VALUES (?,?,?,?,?,?,?, 'scheduled', ?, ?)`,
      id, patientId, doctorId, doctor.department_id, withShiftTime(date, shift), shift,
      reason || null, req.user.id, nowIso()
    );

    createAlert({
      type: 'appointment',
      severity: 'info',
      recipientRole: 'doctor',
      recipientId: get('SELECT id FROM users WHERE doctor_id = ?', doctorId)?.id || null,
      recipientDoctorId: doctorId,
      patientId,
      title: `New appointment · ${patient.name}`,
      message: `${patient.name} (${patientId}) booked ${shift} on ${date}.\nReason: ${reason || 'OPD consultation'}`,
      payload: { appointmentId: id, doctorId, date, shift },
    });

    logActivity({
      actorUserId: req.user.id, actorRole: req.user.role,
      action: 'APPOINTMENT_CREATED', entity: 'appointment', entityId: id,
      details: { patientId, doctorId, date, shift },
    });

    res.status(201).json({ appointment: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

router.patch(
  '/:id/status',
  authenticate,
  requireAnyPermission(P.APPOINTMENT_MANAGE, P.APPOINTMENT_READ),
  asyncHandler((req, res) => {
    requireFields(req.body, ['status']);
    const allowed = ['scheduled', 'completed', 'cancelled'];
    if (!allowed.includes(req.body.status)) throw new HttpError(400, `status must be one of ${allowed.join(', ')}`);
    const appointment = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
    if (!appointment) throw new HttpError(404, 'Appointment not found');
    if (req.user.role === 'doctor' && appointment.doctor_id !== req.user.doctorId) {
      throw new HttpError(403, 'Not your appointment');
    }
    run('UPDATE appointments SET status = ? WHERE id = ?', req.body.status, appointment.id);
    res.json({ appointment: get(`${SELECT} WHERE a.id = ?`, appointment.id) });
  })
);

export default router;
export { bookedCount };
