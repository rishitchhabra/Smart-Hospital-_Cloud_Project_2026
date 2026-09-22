import { get } from '../db.js';
import { createAlert, logActivity } from '../utils.js';

/**
 * Notification Agent
 * Sends urgent alerts to the assigned doctor and to emergency/ward staff.
 */

function findDoctorUser(doctorId) {
  return get('SELECT * FROM users WHERE doctor_id = ? AND active = 1', doctorId);
}

export function runNotificationAgent({ emergency, triage, doctor, bed, ward, actor }) {
  const doctorUser = doctor ? findDoctorUser(doctor.id) : null;

  const bedText = bed ? `${ward?.name || bed.ward_name} / Bed ${bed.bed_number}` : 'Bed pending allocation';

  const doctorMessage =
    `EMERGENCY ${emergency.id}\n` +
    `Condition: ${triage.summary}\n` +
    `Ward/Bed: ${bedText}\n` +
    `Urgency: ${triage.urgency.toUpperCase()} (triage level ${triage.triageLevel})\n` +
    `Action: Proceed to ${bedText} immediately and begin assessment.`;

  const doctorAlertId = createAlert({
    type: 'doctor_alert',
    severity: triage.urgency === 'critical' ? 'critical' : 'warning',
    recipientRole: 'doctor',
    recipientId: doctorUser?.id || null,
    recipientDoctorId: doctor?.id || null,
    emergencyId: emergency.id,
    title: `Urgent: ${emergency.id} assigned to you`,
    message: doctorMessage,
    payload: {
      emergencyId: emergency.id,
      summary: triage.summary,
      ward: ward?.name || null,
      bed: bed?.bed_number || null,
      triageLevel: triage.triageLevel,
      requiredAction: 'Proceed to bed immediately and begin assessment',
    },
  });

  const staffMessage =
    `Incoming emergency ${emergency.id}\n` +
    `Condition: ${triage.summary}\n` +
    `Prepare: ${bedText}\n` +
    `Assigned doctor: ${doctor?.name || 'Pending'}\n` +
    `Required action: Prepare bed and equipment. Mark bed prepared and patient arrival.`;

  const staffAlertId = createAlert({
    type: 'staff_alert',
    severity: triage.urgency === 'critical' ? 'critical' : 'warning',
    recipientRole: 'ward_staff',
    recipientId: null,
    emergencyId: emergency.id,
    title: `Prepare bed for ${emergency.id}`,
    message: staffMessage,
    payload: {
      emergencyId: emergency.id,
      summary: triage.summary,
      ward: ward?.name || null,
      bed: bed?.bed_number || null,
      doctor: doctor?.name || null,
      preparation: triage.recommendedActions,
      requiredAction: 'Prepare bed and equipment',
    },
  });

  logActivity({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'ALERTS_DISPATCHED',
    entity: 'emergency',
    entityId: emergency.id,
    details: { doctorAlertId, staffAlertId, doctor: doctor?.name, bed: bedText },
  });

  return { agent: 'NotificationAgent', doctorAlertId, staffAlertId, bedText };
}

export default { runNotificationAgent };
