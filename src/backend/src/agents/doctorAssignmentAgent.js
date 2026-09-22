import { all, get, run } from '../db.js';
import { nowIso, logActivity } from '../utils.js';

/**
 * Doctor Assignment Agent
 * Finds an available, appropriately specialised doctor for the emergency.
 *
 * Priority:
 *  1. Available doctor whose specialization matches the triage specialization
 *  2. Available doctor in the required department (via department name)
 *  3. Available Emergency Medicine doctor (safe default)
 *  4. Any available doctor
 * Marks the chosen doctor 'busy' so assignment reflects real availability.
 */

function departmentByName(name) {
  if (!name) return null;
  return get('SELECT * FROM departments WHERE LOWER(name) = LOWER(?)', name);
}

export function runDoctorAssignmentAgent({ triage, emergencyId, actor }) {
  const dept = departmentByName(triage.requiredDepartment);

  let doctor = null;
  let matchReason = '';

  doctor = get(
    `SELECT * FROM doctors
      WHERE availability = 'available' AND LOWER(specialization) = LOWER(?)
      ORDER BY CASE WHEN department_id = ? THEN 0 ELSE 1 END, name LIMIT 1`,
    triage.requiredSpecialization || '',
    dept?.id || ''
  );
  if (doctor) matchReason = `Specialization match: ${doctor.specialization}`;

  if (!doctor && dept) {
    doctor = get(
      `SELECT * FROM doctors
        WHERE availability = 'available' AND department_id = ?
        ORDER BY name LIMIT 1`,
      dept.id
    );
    if (doctor) matchReason = `Available in department: ${dept.name}`;
  }

  if (!doctor) {
    const emergencyDept = departmentByName('Emergency');
    doctor = get(
      `SELECT * FROM doctors
        WHERE availability = 'available' AND department_id = ?
        ORDER BY name LIMIT 1`,
      emergencyDept?.id || ''
    );
    if (doctor) matchReason = 'Fallback: available Emergency Medicine doctor';
  }

  if (!doctor) {
    doctor = get(`SELECT * FROM doctors WHERE availability = 'available' ORDER BY name LIMIT 1`);
    if (doctor) matchReason = 'Fallback: any available doctor';
  }

  if (!doctor) {
    logActivity({
      actorUserId: actor?.id,
      actorRole: actor?.role,
      action: 'DOCTOR_ASSIGNMENT_FAILED',
      entity: 'emergency',
      entityId: emergencyId,
      details: { reason: 'No available doctor', requiredDepartment: triage.requiredDepartment },
    });
    return { agent: 'DoctorAssignmentAgent', assigned: false, reason: 'No doctor currently available' };
  }

  run(`UPDATE doctors SET availability = 'busy', current_status = ? WHERE id = ?`, `Assigned to ${emergencyId}`, doctor.id);

  logActivity({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'DOCTOR_ASSIGNED',
    entity: 'doctor',
    entityId: doctor.id,
    details: { emergencyId, doctor: doctor.name, reason: matchReason },
  });

  return {
    agent: 'DoctorAssignmentAgent',
    assigned: true,
    doctor: { ...doctor, availability: 'busy' },
    reason: matchReason,
  };
}

export function releaseDoctor(doctorId) {
  if (!doctorId) return;
  run(`UPDATE doctors SET availability = 'available', current_status = 'Available' WHERE id = ?`, doctorId);
}

export function availableDoctors() {
  return all(
    `SELECT d.*, dep.name AS department_name
       FROM doctors d LEFT JOIN departments dep ON dep.id = d.department_id
      WHERE d.availability = 'available'
      ORDER BY d.name`
  );
}

export default { runDoctorAssignmentAgent, releaseDoctor, availableDoctors };
