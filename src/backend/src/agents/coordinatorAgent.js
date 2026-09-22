import { get, run } from '../db.js';
import { runTriageAgent } from './triageAgent.js';
import { runBedAllocationAgent } from './bedAllocationAgent.js';
import { runDoctorAssignmentAgent } from './doctorAssignmentAgent.js';
import { runNotificationAgent } from './notificationAgent.js';
import { runAdmissionAgent } from './admissionAgent.js';
import {
  newEmergencyId,
  newAccessCode,
  nowIso,
  parseJson,
  mergeTimestamps,
  logActivity,
} from '../utils.js';

/**
 * Coordinator / Orchestrator Agent
 *
 * Drives the serverless-style state machine:
 *   Emergency Chat -> Triage -> Bed Allocation -> Doctor Assignment
 *   -> Notification -> Staff/Doctor -> Patient Arrived -> Admission
 *
 * In AWS this maps to a Step Functions state machine; here each agent is a
 * discrete, testable unit and the coordinator records the execution trace.
 */

function decideIfReady(conversation, triage) {
  const userMessages = conversation.filter((m) => m.role === 'user');
  const text = userMessages.map((m) => m.content).join(' ').toLowerCase();
  const immediate = /(not breathing|isn't breathing|is not breathing|no pulse|unconscious|unresponsive|cardiac arrest|severe bleeding|heavy bleeding|collapsed|not responding|overdose|anaphylaxis|choking)/.test(
    text
  );
  if (immediate) return { ready: true, question: null };
  if (userMessages.length >= 2) return { ready: true, question: null };
  if (userMessages.length === 0) {
    return { ready: false, question: 'Please describe the emergency.' };
  }
  // Dynamic, category-specific clarifying question from the Triage Agent.
  return { ready: false, question: triage?.followUpQuestion || 'Is the patient conscious and breathing normally?' };
}

/**
 * Handle one chatbot turn. Returns either a clarifying question or the full
 * orchestrated emergency workflow result.
 */
export async function handleEmergencyChat({ conversation, actor }) {
  const triage = await runTriageAgent(conversation);

  const { ready, question } = decideIfReady(conversation, triage);
  if (!ready) {
    return {
      type: 'question',
      question,
      triagePreview: {
        urgency: triage.urgency,
        requiredDepartment: triage.requiredDepartment,
        category: triage.category,
      },
    };
  }

  const emergency = await runCoordinator({ conversation, triage, actor });
  return { type: 'workflow', ...emergency };
}

/** Run the full multi-agent pipeline and persist the emergency. */
export async function runCoordinator({ conversation, triage: providedTriage, actor }) {
  const trace = [];
  const t0 = Date.now();
  const startedAt = nowIso();

  const emergencyId = newEmergencyId();
  const accessCode = newAccessCode();

  // ---- Triage Agent ----
  const triage = providedTriage || (await runTriageAgent(conversation));
  trace.push({
    step: 'TRIAGE',
    agent: triage.agent,
    status: 'completed',
    detail: `${triage.urgency.toUpperCase()} · ${triage.requiredDepartment} · triage level ${triage.triageLevel}`,
    at: nowIso(),
  });

  let timestamps = mergeTimestamps('{}', { EMERGENCY_DETECTED: startedAt });
  timestamps = mergeTimestamps(timestamps, { triage: nowIso() });

  run(
    `INSERT INTO emergencies (id, access_code, status, urgency, triage_level, required_department,
        required_specialization, chief_complaint, summary, recommended_actions, triage_confidence,
        triage_evidence, conversation, created_by, timestamps, created_at, updated_at)
     VALUES (?,?, 'EMERGENCY_DETECTED', ?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    emergencyId,
    accessCode,
    triage.urgency,
    triage.triageLevel,
    triage.requiredDepartment,
    triage.requiredSpecialization,
    triage.chiefComplaint,
    triage.summary,
    JSON.stringify(triage.recommendedActions),
    triage.confidence ?? null,
    JSON.stringify({
      category: triage.category,
      matchedSymptoms: triage.matchedSymptoms || [],
      urgencyTriggers: triage.urgencyTriggers || [],
      method: triage.method,
      followUpQuestion: triage.followUpQuestion || null,
    }),
    JSON.stringify(conversation),
    actor?.id || null,
    timestamps,
    startedAt,
    startedAt
  );

  let emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);

  logActivity({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'EMERGENCY_CREATED',
    entity: 'emergency',
    entityId: emergencyId,
    details: { urgency: triage.urgency, department: triage.requiredDepartment },
  });

  // ---- Bed Allocation Agent ----
  const bedResult = runBedAllocationAgent({ triage, emergencyId, actor });
  let bed = null;
  let ward = null;
  if (bedResult.allocated) {
    bed = bedResult.bed;
    ward = get('SELECT * FROM wards WHERE id = ?', bed.ward_id);
    timestamps = mergeTimestamps(timestamps, { BED_RESERVED: nowIso() });
    run(
      `UPDATE emergencies SET status = 'BED_RESERVED', bed_id = ?, ward_id = ?, timestamps = ?, updated_at = ? WHERE id = ?`,
      bed.id,
      bed.ward_id,
      timestamps,
      nowIso(),
      emergencyId
    );
  }
  trace.push({
    step: 'BED_ALLOCATION',
    agent: bedResult.agent,
    status: bedResult.allocated ? 'completed' : 'degraded',
    detail: bedResult.reason,
    at: nowIso(),
  });

  // ---- Doctor Assignment Agent ----
  const docResult = runDoctorAssignmentAgent({ triage, emergencyId, actor });
  let doctor = null;
  if (docResult.assigned) {
    doctor = docResult.doctor;
    timestamps = mergeTimestamps(timestamps, { DOCTOR_ASSIGNED: nowIso() });
    run(
      `UPDATE emergencies SET status = 'DOCTOR_ASSIGNED', doctor_id = ?, timestamps = ?, updated_at = ? WHERE id = ?`,
      doctor.id,
      timestamps,
      nowIso(),
      emergencyId
    );
  }
  trace.push({
    step: 'DOCTOR_ASSIGNMENT',
    agent: docResult.agent,
    status: docResult.assigned ? 'completed' : 'degraded',
    detail: docResult.assigned ? `${doctor.name} · ${docResult.reason}` : docResult.reason,
    at: nowIso(),
  });

  // ---- Notification Agent ----
  emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
  const notifResult = runNotificationAgent({ emergency, triage, doctor, bed, ward, actor });
  timestamps = mergeTimestamps(timestamps, { STAFF_ALERTED: nowIso() });
  run(
    `UPDATE emergencies SET status = 'STAFF_ALERTED', timestamps = ?, updated_at = ? WHERE id = ?`,
    timestamps,
    nowIso(),
    emergencyId
  );
  trace.push({
    step: 'NOTIFICATION',
    agent: notifResult.agent,
    status: 'completed',
    detail: `Alerts sent to ${doctor ? doctor.name : 'doctor pool'} and ward staff (${notifResult.bedText})`,
    at: nowIso(),
  });

  emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);

  return {
    emergencyId,
    accessCode,
    emergency: {
      ...emergency,
      recommended_actions: parseJson(emergency.recommended_actions, []),
      conversation: parseJson(emergency.conversation, []),
      timestamps: parseJson(emergency.timestamps, {}),
      access_code: undefined,
    },
    triage,
    bed,
    ward,
    doctor,
    alerts: { doctor: notifResult.doctorAlertId, staff: notifResult.staffAlertId },
    trace,
    durationMs: Date.now() - t0,
  };
}

/** Ward staff: mark bed prepared. */
export function markBedPrepared({ emergencyId, actor }) {
  const emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
  if (!emergency) {
    const err = new Error('Emergency not found');
    err.status = 404;
    throw err;
  }
  const ts = nowIso();
  const timestamps = mergeTimestamps(emergency.timestamps, { BED_PREPARED: ts });
  run(`UPDATE emergencies SET timestamps = ?, updated_at = ? WHERE id = ?`, timestamps, ts, emergencyId);
  logActivity({ actorUserId: actor?.id, actorRole: actor?.role, action: 'BED_PREPARED', entity: 'emergency', entityId: emergencyId });
  return get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
}

/** Ward staff: mark patient arrived. */
export function markPatientArrived({ emergencyId, actor }) {
  const emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
  if (!emergency) {
    const err = new Error('Emergency not found');
    err.status = 404;
    throw err;
  }
  const ts = nowIso();
  const timestamps = mergeTimestamps(emergency.timestamps, { PATIENT_ARRIVED: ts });
  run(
    `UPDATE emergencies SET status = CASE WHEN status IN ('ADMITTED') THEN status ELSE 'PATIENT_ARRIVED' END,
        timestamps = ?, updated_at = ? WHERE id = ?`,
    timestamps,
    ts,
    emergencyId
  );
  logActivity({ actorUserId: actor?.id, actorRole: actor?.role, action: 'PATIENT_ARRIVED', entity: 'emergency', entityId: emergencyId });
  return get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
}

export { runAdmissionAgent };
export default { handleEmergencyChat, runCoordinator, runAdmissionAgent, markBedPrepared, markPatientArrived };
