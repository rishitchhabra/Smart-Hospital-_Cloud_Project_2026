import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, run } from '../db.js';
import { authenticateUser, signToken, publicUser, authenticate, permissionsForRole } from '../auth.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { logActivity } from '../utils.js';

const router = Router();

router.post(
  '/login',
  asyncHandler((req, res) => {
    requireFields(req.body, ['username', 'password']);
    const { username, password } = req.body;
    const user = authenticateUser(username, password);
    if (!user) throw new HttpError(401, 'Invalid username or password');
    if (!user.active) throw new HttpError(403, 'Account disabled');

    logActivity({ actorUserId: user.id, actorRole: user.role, action: 'LOGIN', entity: 'user', entityId: user.id });

    res.json({
      token: signToken(user),
      user: publicUser(user),
      permissions: permissionsForRole(user.role),
    });
  })
);

/**
 * Emergency/patient access without a username: works for patients registered
 * through the emergency workflow. Requires the temporary access code.
 */
router.post(
  '/patient-access',
  asyncHandler((req, res) => {
    requireFields(req.body, ['patientId', 'accessCode']);
    const { patientId, accessCode } = req.body;

    const patient = get('SELECT * FROM patients WHERE id = ? OR emergency_id = ?', patientId, patientId);
    if (!patient) throw new HttpError(404, 'No patient found for that ID');

    const emergency = patient.emergency_id ? get('SELECT * FROM emergencies WHERE id = ?', patient.emergency_id) : null;
    const validCode = emergency && emergency.access_code === String(accessCode);
    const validPortal = patient.portal_code && patient.portal_code === String(accessCode);
    if (!validCode && !validPortal) {
      throw new HttpError(401, 'Invalid access code');
    }

    const user = get('SELECT * FROM users WHERE patient_id = ?', patient.id);
    if (!user) throw new HttpError(404, 'Patient account not provisioned');

    logActivity({ actorUserId: user.id, actorRole: user.role, action: 'PATIENT_LOGIN', entity: 'patient', entityId: patient.id });

    res.json({ token: signToken(user), user: publicUser(user), permissions: permissionsForRole(user.role) });
  })
);

/** Attendant tracking: emergency id + access code, no account required. */
router.post(
  '/emergency-access',
  asyncHandler((req, res) => {
    requireFields(req.body, ['emergencyId', 'accessCode']);
    const { emergencyId, accessCode } = req.body;
    const emergency = get('SELECT * FROM emergencies WHERE id = ?', emergencyId);
    if (!emergency || emergency.access_code !== String(accessCode)) {
      throw new HttpError(401, 'Invalid emergency ID or access code');
    }
    const patient = emergency.patient_id ? get('SELECT * FROM patients WHERE id = ?', emergency.patient_id) : null;
    const user = patient ? get('SELECT * FROM users WHERE patient_id = ?', patient.id) : null;
    if (!user) throw new HttpError(404, 'Patient record not completed yet');
    res.json({ token: signToken(user), user: publicUser(user), permissions: permissionsForRole(user.role) });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler((req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', req.user.sub);
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user: publicUser(user), permissions: permissionsForRole(user.role) });
  })
);

router.post(
  '/change-password',
  authenticate,
  asyncHandler((req, res) => {
    requireFields(req.body, ['currentPassword', 'newPassword']);
    const user = get('SELECT * FROM users WHERE id = ?', req.user.sub);
    if (!bcrypt.compareSync(req.body.currentPassword, user.password_hash)) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(req.body.newPassword, 10), user.id);
    logActivity({ actorUserId: user.id, actorRole: user.role, action: 'PASSWORD_CHANGED', entity: 'user', entityId: user.id });
    res.json({ ok: true });
  })
);

export default router;
