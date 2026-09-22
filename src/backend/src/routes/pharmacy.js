import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { nowIso, logActivity, createAlert } from '../utils.js';
import { scheduleFor } from './clinical.js';

const router = Router();

const STATUSES = ['pending', 'preparing', 'ready', 'dispensed'];

const SELECT = `SELECT rx.*, p.name AS patient_name, p.id AS patient_code, p.emergency_id,
                       p.patient_type, d.name AS doctor_name, d.specialization,
                       e.id AS emergency_id_ref, e.bed_id, e.ward_id
                  FROM prescriptions rx
                  LEFT JOIN patients p ON p.id = rx.patient_id
                  LEFT JOIN doctors d ON d.id = rx.doctor_id
                  LEFT JOIN emergencies e ON e.id = p.emergency_id`;

function itemsFor(prescriptionId) {
  return all('SELECT * FROM prescription_items WHERE prescription_id = ?', prescriptionId).map((it) => ({
    ...it,
    schedule: scheduleFor(it.frequency),
    medicine: it.medicine_id ? get('SELECT * FROM medicines WHERE id = ?', it.medicine_id) : null,
  }));
}

/** Pharmacy work queue. */
router.get(
  '/prescriptions',
  authenticate,
  requirePermission(P.PHARMACY_READ),
  asyncHandler((req, res) => {
    const { status } = req.query;
    const rows = status
      ? all(`${SELECT} WHERE rx.status != 'note' AND rx.fulfillment_status = ? ORDER BY datetime(rx.created_at) DESC`, status)
      : all(`${SELECT} WHERE rx.status != 'note' ORDER BY datetime(rx.created_at) DESC LIMIT 200`);
    res.json({
      prescriptions: rows.map((r) => ({
        ...r,
        isEmergency: Boolean(r.emergency_id),
        items: itemsFor(r.id),
      })),
    });
  })
);

/** Pharmacy updates fulfilment status. */
router.patch(
  '/prescriptions/:id',
  authenticate,
  requirePermission(P.PHARMACY_DISPENSE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['status']);
    if (!STATUSES.includes(req.body.status)) throw new HttpError(400, `status must be one of ${STATUSES.join(', ')}`);
    const rx = get('SELECT * FROM prescriptions WHERE id = ?', req.params.id);
    if (!rx) throw new HttpError(404, 'Prescription not found');

    run(
      `UPDATE prescriptions SET fulfillment_status = ?, prepared_by = ?, dispensed_at = ? WHERE id = ?`,
      req.body.status,
      req.user.name,
      req.body.status === 'dispensed' ? nowIso() : null,
      rx.id
    );

    if (['ready', 'dispensed'].includes(req.body.status)) {
      createAlert({
        type: 'pharmacy',
        severity: 'info',
        recipientRole: 'doctor',
        recipientId: get('SELECT id FROM users WHERE doctor_id = ?', rx.doctor_id)?.id || null,
        recipientDoctorId: rx.doctor_id,
        patientId: rx.patient_id,
        title: `Medicines ${req.body.status} · ${rx.id}`,
        message: `Pharmacy marked prescription ${rx.id} as ${req.body.status}.`,
        payload: { prescriptionId: rx.id },
      });

      // Notify the patient so they can see/collect their medicines.
      const patientUser = get('SELECT id FROM users WHERE patient_id = ?', rx.patient_id);
      if (patientUser) {
        createAlert({
          type: 'pharmacy',
          severity: req.body.status === 'ready' ? 'warning' : 'info',
          recipientRole: 'patient',
          recipientId: patientUser.id,
          patientId: rx.patient_id,
          title: req.body.status === 'ready' ? 'Your medicines are ready' : 'Medicines dispensed',
          message:
            req.body.status === 'ready'
              ? `Your prescription ${rx.id} is ready. Please collect it from the pharmacy.`
              : `Your prescription ${rx.id} has been dispensed. Follow the dosage instructions.`,
          payload: { prescriptionId: rx.id },
        });
      }
    }

    logActivity({
      actorUserId: req.user.id, actorRole: req.user.role,
      action: 'PRESCRIPTION_FULFILLMENT_UPDATED', entity: 'prescription', entityId: rx.id,
      details: { status: req.body.status },
    });

    res.json({ prescription: get(`${SELECT} WHERE rx.id = ?`, rx.id) });
  })
);

export default router;
