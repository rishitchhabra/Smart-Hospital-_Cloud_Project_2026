import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate, requirePermission, requireAnyPermission, requireRole } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { handleEmergencyChat, markBedPrepared, markPatientArrived, runAdmissionAgent } from '../agents/coordinatorAgent.js';
import { runDoctorAssignmentAgent, releaseDoctor } from '../agents/doctorAssignmentAgent.js';
import { newAccessCode, parseJson, nowIso, mergeTimestamps, logActivity } from '../utils.js';
import { createAlert } from '../utils.js';

const router = Router();

const STATUS_LABELS = {
  EMERGENCY_DETECTED: 'Emergency Detected',
  BED_RESERVED: 'Bed Reserved',
  DOCTOR_ASSIGNED: 'Doctor Assigned',
  STAFF_ALERTED: 'Staff Alerted',
  PATIENT_ARRIVED: 'Patient Arrived',
  ADMITTED: 'Admitted',
  CANCELLED: 'Cancelled',
};

const WORKFLOW_STEPS = [
  'EMERGENCY_DETECTED',
  'BED_RESERVED',
  'DOCTOR_ASSIGNED',
  'STAFF_ALERTED',
  'PATIENT_ARRIVED',
  'ADMITTED',
];

function enrich(row) {
  if (!row) return null;
  const ward = row.ward_id ? get('SELECT id, name, type, floor FROM wards WHERE id = ?', row.ward_id) : null;
  const bed = row.bed_id
    ? get('SELECT id, bed_number, bed_type, status FROM beds WHERE id = ?', row.bed_id)
    : null;
  const doctor = row.doctor_id
    ? get('SELECT id, name, specialization, department_id, phone, email FROM doctors WHERE id = ?', row.doctor_id)
    : null;
  const patient = row.patient_id ? get('SELECT id, name, age, gender FROM patients WHERE id = ?', row.patient_id) : null;
  const timestamps = parseJson(row.timestamps, {});
  const statusIndex = WORKFLOW_STEPS.indexOf(row.status);
  return {
    ...row,
    recommended_actions: parseJson(row.recommended_actions, []),
    triage_evidence: parseJson(row.triage_evidence, {}),
    conversation: row.showConversation === false ? undefined : parseJson(row.conversation, []),
    timestamps,
    ward,
    bed,
    doctor,
    patient,
    statusLabel: STATUS_LABELS[row.status] || row.status,
    timeline: WORKFLOW_STEPS.map((s, i) => ({
      key: s,
      label: STATUS_LABELS[s],
      done: statusIndex >= i && row.status !== 'CANCELLED',
      at: timestamps[s] || null,
    })),
  };
}

function timelineFor(row) {
  const timestamps = parseJson(row.timestamps, {});
  const statusIndex = WORKFLOW_STEPS.indexOf(row.status);
  return WORKFLOW_STEPS.map((s, i) => ({
    key: s,
    label: STATUS_LABELS[s],
    done: statusIndex >= i && row.status !== 'CANCELLED',
    at: timestamps[s] || null,
  }));
}

/** Emergency intake chat. Restricted to reception (and admin) staff. */
router.post(
  '/chat',
  authenticate,
  requirePermission(P.CHAT_USE),
  asyncHandler(async (req, res) => {
    const conversation = Array.isArray(req.body?.conversation) ? req.body.conversation : [];
    if (!conversation.length) throw new HttpError(400, 'conversation is required');
    const result = await handleEmergencyChat({ conversation, actor: req.user });
    if (result.type === 'workflow') {
      result.emergency.timeline = timelineFor(result.emergency);
    }
    res.status(201).json(result);
  })
);

/** Authenticated chat (used by reception). */
router.post(
  '/chat/authenticated',
  authenticate,
  requirePermission(P.CHAT_USE),
  asyncHandler(async (req, res) => {
    const conversation = Array.isArray(req.body?.conversation) ? req.body.conversation : [];
    if (!conversation.length) throw new HttpError(400, 'conversation is required');
    const result = await handleEmergencyChat({ conversation, actor: req.user });
    if (result.type === 'workflow') result.emergency.timeline = timelineFor(result.emergency);
    res.status(201).json(result);
  })
);

/** PUBLIC: attendant status tracking by Emergency ID (access code optional). */
router.get(
  '/public/:id',
  asyncHandler((req, res) => {
    const row = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!row) throw new HttpError(404, 'Emergency not found');
    res.json({
      emergencyId: row.id,
      status: row.status,
      statusLabel: STATUS_LABELS[row.status] || row.status,
      urgency: row.urgency,
      triageLevel: row.triage_level,
      triageConfidence: row.triage_confidence,
      triageEvidence: parseJson(row.triage_evidence, {}),
      requiredDepartment: row.required_department,
      summary: row.summary,
      recommendedActions: parseJson(row.recommended_actions, []),
      ward: row.ward_id ? get('SELECT name, floor FROM wards WHERE id = ?', row.ward_id) : null,
      bed: row.bed_id ? get('SELECT bed_number FROM beds WHERE id = ?', row.bed_id) : null,
      doctor: row.doctor_id ? get('SELECT name, specialization FROM doctors WHERE id = ?', row.doctor_id) : null,
      patientId: row.patient_id,
      timeline: timelineFor(row),
      timestamps: parseJson(row.timestamps, {}),
    });
  })
);

/** List emergencies, scoped by role. */
router.get(
  '/',
  authenticate,
  requireAnyPermission(P.EMERGENCY_READ, P.EMERGENCY_READ_ASSIGNED),
  asyncHandler((req, res) => {
    let rows;
    if (req.user.role === 'doctor') {
      rows = all(
        `SELECT * FROM emergencies WHERE doctor_id = ? ORDER BY datetime(created_at) DESC`,
        req.user.doctorId
      );
    } else if (req.user.role === 'patient') {
      rows = all(`SELECT * FROM emergencies WHERE patient_id = ? ORDER BY datetime(created_at) DESC`, req.user.patientId);
    } else {
      rows = all(`SELECT * FROM emergencies ORDER BY datetime(created_at) DESC LIMIT 200`);
    }
    res.json({ emergencies: rows.map((r) => ({ ...enrich(r), showConversation: false })) });
  })
);

router.get(
  '/:id',
  authenticate,
  requireAnyPermission(P.EMERGENCY_READ, P.EMERGENCY_READ_ASSIGNED),
  asyncHandler((req, res) => {
    const row = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!row) throw new HttpError(404, 'Emergency not found');
    if (req.user.role === 'doctor' && row.doctor_id !== req.user.doctorId) {
      throw new HttpError(403, 'Not assigned to this emergency');
    }
    res.json({ emergency: enrich(row) });
  })
);

/** Ward staff: mark bed prepared. */
router.post(
  '/:id/prepare',
  authenticate,
  requirePermission(P.BED_UPDATE),
  asyncHandler((req, res) => {
    const row = markBedPrepared({ emergencyId: req.params.id, actor: req.user });
    res.json({ emergency: enrich(row) });
  })
);

/** Ward staff: mark patient arrived. */
router.post(
  '/:id/arrive',
  authenticate,
  requirePermission(P.BED_UPDATE),
  asyncHandler((req, res) => {
    const row = markPatientArrived({ emergencyId: req.params.id, actor: req.user });
    res.json({ emergency: enrich(row) });
  })
);

/** Reception/ward/doctor/admin: convert emergency into a full patient record. */
router.post(
  '/:id/admit',
  authenticate,
  requireAnyPermission(P.EMERGENCY_ADMIT, P.ADMISSION_CREATE),
  asyncHandler((req, res) => {
    const emergency = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!emergency) throw new HttpError(404, 'Emergency not found');
    if (req.user.role === 'doctor' && emergency.doctor_id !== req.user.doctorId) {
      throw new HttpError(403, 'You can only admit patients assigned to you');
    }
    const result = runAdmissionAgent({
      emergencyId: req.params.id,
      details: req.body || {},
      actor: req.user,
    });
    res.status(201).json(result);
  })
);

/**
 * Reception/admin: correct the AI-assigned department for an emergency and
 * re-run doctor assignment. Makes the allocation explicit and reviewable.
 */
router.patch(
  '/:id/triage',
  authenticate,
  requirePermission(P.EMERGENCY_TRIAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['department']);
    const row = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!row) throw new HttpError(404, 'Emergency not found');

    const dept = get('SELECT * FROM departments WHERE LOWER(name) = LOWER(?)', req.body.department);
    if (!dept) throw new HttpError(400, `Unknown department: ${req.body.department}`);

    const specialization = req.body.specialization || dept.name;
    const ts = nowIso();

    // Release the previously assigned doctor and reassign for the new department.
    if (row.doctor_id) releaseDoctor(row.doctor_id);

    const triage = {
      urgency: row.urgency,
      triageLevel: row.triage_level,
      requiredDepartment: dept.name,
      requiredSpecialization: specialization,
      wardHint: req.body.wardHint || 'emergency',
    };
    const result = runDoctorAssignmentAgent({ triage, emergencyId: row.id, actor: req.user });

    run(
      `UPDATE emergencies SET required_department = ?, required_specialization = ?, doctor_id = ?, updated_at = ? WHERE id = ?`,
      dept.name,
      specialization,
      result.assigned ? result.doctor.id : null,
      ts,
      row.id
    );

    const evidence = parseJson(row.triage_evidence, {});
    run(
      `UPDATE emergencies SET triage_evidence = ? WHERE id = ?`,
      JSON.stringify({ ...evidence, manualOverride: { department: dept.name, by: req.user.name, at: ts } }),
      row.id
    );

    logActivity({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'EMERGENCY_TRIAGE_OVERRIDDEN',
      entity: 'emergency',
      entityId: row.id,
      details: { department: dept.name, doctor: result.doctor?.name || null },
    });

    res.json({ emergency: enrich(get('SELECT * FROM emergencies WHERE id = ?', row.id)) });
  })
);

/**
 * Start treatment: creates a minimal patient record from an emergency so the
 * assigned doctor can add clinical records immediately, without completing the
 * full registration form first. Details can be completed later.
 */
router.post(
  '/:id/start-treatment',
  authenticate,
  requireAnyPermission(P.CLINICAL_WRITE, P.EMERGENCY_ADMIT, P.ADMISSION_CREATE),
  asyncHandler((req, res) => {
    const emergency = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!emergency) throw new HttpError(404, 'Emergency not found');
    if (req.user.role === 'doctor' && emergency.doctor_id !== req.user.doctorId) {
      throw new HttpError(403, 'You can only start treatment for patients assigned to you');
    }
    const result = runAdmissionAgent({
      emergencyId: req.params.id,
      details: {
        name: req.body?.name || 'Unidentified Emergency Patient',
        emergency_details: emergency.summary,
      },
      actor: req.user,
    });
    res.status(201).json(result);
  })
);

router.post(
  '/:id/cancel',
  authenticate,
  requireRole('reception', 'admin'),
  asyncHandler((req, res) => {
    const row = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!row) throw new HttpError(404, 'Emergency not found');
    const ts = nowIso();
    const timestamps = mergeTimestamps(row.timestamps, { CANCELLED: ts });
    run(`UPDATE emergencies SET status = 'CANCELLED', timestamps = ?, updated_at = ? WHERE id = ?`, timestamps, ts, row.id);
    if (row.bed_id) {
      run(`UPDATE beds SET status = 'cleaning', current_emergency_id = NULL, updated_at = ? WHERE id = ?`, ts, row.bed_id);
    }
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'EMERGENCY_CANCELLED', entity: 'emergency', entityId: row.id });
    res.json({ emergency: enrich(get('SELECT * FROM emergencies WHERE id = ?', row.id)) });
  })
);

/**
 * Reception can re-issue the temporary access code for an emergency that was
 * created over the phone.
 */
router.post(
  '/:id/reissue-code',
  authenticate,
  requireRole('reception', 'admin'),
  asyncHandler((req, res) => {
    const row = get('SELECT * FROM emergencies WHERE id = ?', req.params.id);
    if (!row) throw new HttpError(404, 'Emergency not found');
    const code = newAccessCode();
    run('UPDATE emergencies SET access_code = ?, updated_at = ? WHERE id = ?', code, nowIso(), row.id);
    createAlert({
      type: 'system',
      severity: 'info',
      recipientRole: 'reception',
      title: `Access code reissued for ${row.id}`,
      message: `New access code: ${code}`,
      emergencyId: row.id,
    });
    res.json({ emergencyId: row.id, accessCode: code });
  })
);

export default router;
export { STATUS_LABELS, WORKFLOW_STEPS };
