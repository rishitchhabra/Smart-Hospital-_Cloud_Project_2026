import { randomBytes, randomInt } from 'node:crypto';
import { run, get, all } from './db.js';

const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newEmergencyId() {
  let id;
  do {
    let s = '';
    const bytes = randomBytes(6);
    for (let i = 0; i < 6; i += 1) s += ALNUM[bytes[i] % ALNUM.length];
    id = `EMG-${s}`;
  } while (get('SELECT 1 AS x FROM emergencies WHERE id = ?', id));
  return id;
}

export function newPatientId() {
  let id;
  do {
    const n = randomInt(100000, 999999);
    id = `PAT-${n}`;
  } while (get('SELECT 1 AS x FROM patients WHERE id = ?', id));
  return id;
}

export function newAccessCode() {
  return String(randomInt(100000, 999999));
}

export function newId(prefix) {
  let s = '';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i += 1) s += ALNUM[bytes[i] % ALNUM.length];
  return `${prefix}-${s}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function logActivity({ actorUserId = null, actorRole = null, action, entity = null, entityId = null, details = null }) {
  run(
    `INSERT INTO activity_logs (id, actor_user_id, actor_role, action, entity, entity_id, details, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    newId('LOG'),
    actorUserId,
    actorRole,
    action,
    entity,
    entityId,
    details ? JSON.stringify(details) : null,
    nowIso()
  );
}

export function createAlert({
  type,
  severity = 'info',
  recipientRole = null,
  recipientId = null,
  recipientDoctorId = null,
  emergencyId = null,
  patientId = null,
  title,
  message,
  payload = null,
}) {
  const id = newId('ALR');
  run(
    `INSERT INTO alerts (id, type, severity, recipient_role, recipient_id, recipient_doctor_id, emergency_id, patient_id, title, message, payload, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?, 'unread', ?)`,
    id,
    type,
    severity,
    recipientRole,
    recipientId,
    recipientDoctorId,
    emergencyId,
    patientId,
    title,
    message,
    payload ? JSON.stringify(payload) : null,
    nowIso()
  );
  return id;
}

/** Tolerant JSON parse for DB columns. */
export function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function mergeTimestamps(existing, patch) {
  const base = parseJson(existing, {});
  return JSON.stringify({ ...base, ...patch });
}

export function publicEmergency(row) {
  if (!row) return null;
  return {
    ...row,
    recommended_actions: parseJson(row.recommended_actions, []),
    conversation: parseJson(row.conversation, []),
    timestamps: parseJson(row.timestamps, {}),
    access_code: undefined,
  };
}

export { get, all, run };
