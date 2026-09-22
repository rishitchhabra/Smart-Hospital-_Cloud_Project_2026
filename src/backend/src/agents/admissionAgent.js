import bcrypt from 'bcryptjs';
import { get, run, tx } from '../db.js';
import { newPatientId, nowIso, parseJson, mergeTimestamps, createAlert, logActivity } from '../utils.js';

/**
 * Admission Agent
 * Converts a temporary Emergency ID into a complete, permanent patient record.
 * Preserves the original emergency workflow and its timestamps, and provisions
 * a patient login so the patient can view their own information.
 */

export function runAdmissionAgent({ emergencyId, details = {}, actor }) {
  const emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
  if (!emergency) {
    const err = new Error('Emergency not found');
    err.status = 404;
    throw err;
  }

  const result = tx(() => {
    let patient = emergency.patient_id
      ? get('SELECT * FROM patients WHERE id = ?', emergency.patient_id)
      : null;

    const ts = nowIso();

    if (patient) {
      run(
        `UPDATE patients SET name = ?, age = ?, gender = ?, contact = ?, address = ?, blood_group = ?,
             emergency_details = ?, attendant_name = ?, attendant_contact = ?, medical_history = ?,
             allergies = ?, updated_at = ?
         WHERE id = ?`,
        details.name ?? patient.name,
        details.age ?? patient.age,
        details.gender ?? patient.gender,
        details.contact ?? patient.contact,
        details.address ?? patient.address,
        details.blood_group ?? patient.blood_group,
        details.emergency_details ?? patient.emergency_details,
        details.attendant_name ?? patient.attendant_name,
        details.attendant_contact ?? patient.attendant_contact,
        details.medical_history ?? patient.medical_history,
        details.allergies ?? patient.allergies,
        ts,
        patient.id
      );
      patient = get('SELECT * FROM patients WHERE id = ?', patient.id);
    } else {
      const patientId = newPatientId();
      run(
        `INSERT INTO patients (id, emergency_id, name, age, gender, contact, address, blood_group,
             emergency_details, attendant_name, attendant_contact, medical_history, allergies, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        patientId,
        emergency.id,
        details.name || 'Unidentified Emergency Patient',
        details.age ?? null,
        details.gender ?? null,
        details.contact ?? null,
        details.address ?? null,
        details.blood_group ?? null,
        details.emergency_details ?? emergency.summary,
        details.attendant_name ?? null,
        details.attendant_contact ?? null,
        details.medical_history ?? null,
        details.allergies ?? null,
        actor?.id || null,
        ts,
        ts
      );
      patient = get('SELECT * FROM patients WHERE id = ?', patientId);
    }

    // Admission record
    let admission = get('SELECT * FROM admissions WHERE emergency_id = ?', emergency.id);
    if (!admission) {
      run(
        `INSERT INTO admissions (id, patient_id, emergency_id, ward_id, bed_id, doctor_id, status, admission_type, notes, admitted_at)
         VALUES (?,?,?,?,?,?, 'admitted', 'emergency', ?, ?)`,
        `ADM-${patient.id.replace('PAT-', '')}`,
        patient.id,
        emergency.id,
        emergency.ward_id,
        emergency.bed_id,
        emergency.doctor_id,
        details.admission_notes || null,
        ts
      );
      admission = get('SELECT * FROM admissions WHERE emergency_id = ?', emergency.id);
    }

    // Occupy the bed
    if (emergency.bed_id) {
      run(
        `UPDATE beds SET status = 'occupied', current_emergency_id = ?, updated_at = ? WHERE id = ?`,
        emergency.id,
        ts,
        emergency.bed_id
      );
    }

    // Update emergency status + preserve/extend workflow timestamps
    const timestamps = mergeTimestamps(emergency.timestamps, {
      ADMITTED: ts,
      admission: ts,
    });
    run(
      `UPDATE emergencies SET status = 'ADMITTED', patient_id = ?, timestamps = ?, updated_at = ? WHERE id = ?`,
      patient.id,
      timestamps,
      ts,
      emergency.id
    );

    // Provision patient login (username = patient id, password = emergency access code)
    const existingUser = get('SELECT * FROM users WHERE patient_id = ?', patient.id);
    const username = patient.id.toLowerCase();
    if (!existingUser) {
      run(
        `INSERT INTO users (id, username, password_hash, name, email, phone, role, patient_id, active, created_at)
         VALUES (?,?,?,?,?,?, 'patient', ?, 1, ?)`,
        `USR-${patient.id}`,
        username,
        bcrypt.hashSync(emergency.access_code, 10),
        patient.name,
        patient.contact,
        patient.contact,
        patient.id,
        ts
      );
    }

    return { patient, admission, emergency: get('SELECT * FROM emergencies WHERE id = ?', emergency.id) };
  });

  const { patient, admission, emergency: updatedEmergency } = result;

  createAlert({
    type: 'admission_alert',
    severity: 'info',
    recipientRole: 'doctor',
    recipientId: null,
    recipientDoctorId: emergency.doctor_id || null,
    emergencyId: emergency.id,
    patientId: patient.id,
    title: `${emergency.id} admitted as ${patient.id}`,
    message:
      `Patient ${patient.name} (${patient.id}) has been admitted from emergency ${emergency.id}.\n` +
      `Bed: ${emergency.bed_id || 'n/a'}\nDiagnosis/treatment can now be added.`,
    payload: { emergencyId: emergency.id, patientId: patient.id },
  });

  logActivity({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action: 'PATIENT_ADMITTED',
    entity: 'patient',
    entityId: patient.id,
    details: { emergencyId: emergency.id, admissionId: admission?.id },
  });

  return {
    agent: 'AdmissionAgent',
    patient,
    admission,
    emergency: updatedEmergency,
    patientLogin: { username: patient.id.toLowerCase(), password: emergency.access_code },
    timestamps: parseJson(updatedEmergency.timestamps, {}),
  };
}

export default { runAdmissionAgent };
