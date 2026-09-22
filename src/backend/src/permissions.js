export const ROLES = {
  ADMIN: 'admin',
  RECEPTION: 'reception',
  WARD_STAFF: 'ward_staff',
  DOCTOR: 'doctor',
  PHARMACIST: 'pharmacist',
  PATIENT: 'patient',
};

export const PERMISSIONS = {
  ADMIN_ALL: '*',

  // Emergency / chat
  CHAT_USE: 'chat:use',
  EMERGENCY_READ: 'emergency:read',
  EMERGENCY_READ_ASSIGNED: 'emergency:read:assigned',
  EMERGENCY_TRIAGE: 'emergency:triage',
  EMERGENCY_ADMIT: 'emergency:admit',
  EMERGENCY_CANCEL: 'emergency:cancel',

  // Beds
  BED_READ: 'bed:read',
  BED_UPDATE: 'bed:update',
  BED_MANAGE: 'bed:manage',

  // Patients
  PATIENT_REGISTER: 'patient:register',
  PATIENT_READ: 'patient:read',
  PATIENT_READ_ASSIGNED: 'patient:read:assigned',
  PATIENT_READ_SELF: 'patient:read:self',

  // Admissions
  ADMISSION_CREATE: 'admission:create',
  ADMISSION_READ: 'admission:read',
  ADMISSION_CONFIRM: 'admission:confirm',
  ADMISSION_MANAGE: 'admission:manage',

  // Clinical (doctor only)
  CLINICAL_WRITE: 'clinical:write',
  PRESCRIPTION_WRITE: 'prescription:write',
  PRESCRIPTION_READ: 'prescription:read',
  PRESCRIPTION_READ_SELF: 'prescription:read:self',
  TREATMENT_UPDATE: 'treatment:update',
  DOCTOR_DUTY: 'doctor:duty',

  // Pharmacy
  PHARMACY_READ: 'pharmacy:read',
  PHARMACY_DISPENSE: 'pharmacy:dispense',

  // Alerts
  ALERT_READ: 'alert:read',
  ALERT_ACK: 'alert:ack',

  // Appointments
  APPOINTMENT_READ: 'appointment:read',
  APPOINTMENT_READ_SELF: 'appointment:read:self',
  APPOINTMENT_MANAGE: 'appointment:manage',
  APPOINTMENT_CREATE_SELF: 'appointment:create:self',

  // Administration
  USER_MANAGE: 'user:manage',
  HOSPITAL_MANAGE: 'hospital:manage',
  SCHEDULE_MANAGE: 'schedule:manage',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
};

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [P.ADMIN_ALL],

  [ROLES.RECEPTION]: [
    P.CHAT_USE,
    P.EMERGENCY_READ,
    P.EMERGENCY_TRIAGE,
    P.PATIENT_REGISTER,
    P.PATIENT_READ,
    P.ADMISSION_CREATE,
    P.ADMISSION_READ,
    P.BED_READ,
    P.APPOINTMENT_READ,
    P.APPOINTMENT_MANAGE,
    P.ALERT_READ,
    P.EMERGENCY_ADMIT,
  ],

  [ROLES.WARD_STAFF]: [
    P.EMERGENCY_READ,
    P.BED_READ,
    P.BED_UPDATE,
    P.ADMISSION_READ,
    P.ADMISSION_CONFIRM,
    P.PATIENT_READ_ASSIGNED,
    P.ALERT_READ,
    P.ALERT_ACK,
  ],

  [ROLES.DOCTOR]: [
    P.EMERGENCY_READ_ASSIGNED,
    P.EMERGENCY_ADMIT,
    P.PATIENT_READ_ASSIGNED,
    P.PATIENT_REGISTER,
    P.ADMISSION_CREATE,
    P.ADMISSION_READ,
    P.CLINICAL_WRITE,
    P.PRESCRIPTION_WRITE,
    P.PRESCRIPTION_READ,
    P.TREATMENT_UPDATE,
    P.DOCTOR_DUTY,
    P.BED_READ,
    P.ALERT_READ,
    P.ALERT_ACK,
    P.APPOINTMENT_READ,
  ],

  [ROLES.PHARMACIST]: [
    P.PHARMACY_READ,
    P.PHARMACY_DISPENSE,
    P.PRESCRIPTION_READ,
    P.PATIENT_READ,
    P.ALERT_READ,
    P.ALERT_ACK,
  ],

  [ROLES.PATIENT]: [
    P.PATIENT_READ_SELF,
    P.PRESCRIPTION_READ_SELF,
    P.ADMISSION_READ,
    P.APPOINTMENT_READ_SELF,
    P.APPOINTMENT_CREATE_SELF,
    P.ALERT_READ,
  ],
};

export function permissionsForRole(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role, permission) {
  const perms = permissionsForRole(role);
  return perms.includes(P.ADMIN_ALL) || perms.includes(permission);
}

export function hasAnyPermission(role, list) {
  return list.some((p) => hasPermission(role, p));
}
