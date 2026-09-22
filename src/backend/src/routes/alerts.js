import { Router } from 'express';
import { all, get, run } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { PERMISSIONS as P } from '../permissions.js';
import { asyncHandler, HttpError } from '../http.js';
import { nowIso, logActivity } from '../utils.js';

const router = Router();

/**
 * Alerts are scoped so that each user only sees what concerns them:
 *  - admin/reception: everything (operational oversight)
 *  - doctor: only alerts targeted at them (recipient_id) or their doctor profile
 *            (recipient_doctor_id) — never another doctor's emergencies
 *  - patient: only their own
 *  - ward_staff / pharmacist: role broadcasts
 */
function scopeFor(user) {
  if (user.role === 'admin' || user.role === 'reception') return { sql: '1=1', params: [] };
  if (user.role === 'patient') {
    return { sql: "(recipient_role = 'patient' AND recipient_id = ?)", params: [user.sub] };
  }
  if (user.role === 'doctor') {
    return {
      sql: "(recipient_role = 'doctor' AND (recipient_id = ? OR recipient_doctor_id = ?))",
      params: [user.sub, user.doctorId],
    };
  }
  return { sql: '(recipient_role = ?)', params: [user.role] };
}

function canAccessAlert(user, alert) {
  if (user.role === 'admin' || user.role === 'reception') return true;
  if (user.role === 'doctor') {
    return alert.recipient_id === user.sub || alert.recipient_doctor_id === user.doctorId;
  }
  if (user.role === 'patient') {
    return alert.recipient_role === 'patient' && alert.recipient_id === user.sub;
  }
  return alert.recipient_role === user.role;
}

router.get(
  '/',
  authenticate,
  requirePermission(P.ALERT_READ),
  asyncHandler((req, res) => {
    const scope = scopeFor(req.user);
    const rows = all(
      `SELECT * FROM alerts WHERE ${scope.sql} ORDER BY datetime(created_at) DESC LIMIT 100`,
      ...scope.params
    );
    res.json({ alerts: rows });
  })
);

router.get(
  '/unread-count',
  authenticate,
  requirePermission(P.ALERT_READ),
  asyncHandler((req, res) => {
    const scope = scopeFor(req.user);
    const row = get(
      `SELECT COUNT(*) AS c FROM alerts WHERE ${scope.sql} AND status = 'unread'`,
      ...scope.params
    );
    res.json({ count: row.c });
  })
);

router.post(
  '/:id/read',
  authenticate,
  requirePermission(P.ALERT_READ),
  asyncHandler((req, res) => {
    const alert = get('SELECT * FROM alerts WHERE id = ?', req.params.id);
    if (!alert) throw new HttpError(404, 'Alert not found');
    if (!canAccessAlert(req.user, alert)) throw new HttpError(403, 'Not your alert');
    run(`UPDATE alerts SET status = 'read', read_at = ? WHERE id = ? AND status = 'unread'`, nowIso(), alert.id);
    res.json({ alert: get('SELECT * FROM alerts WHERE id = ?', alert.id) });
  })
);

router.post(
  '/:id/ack',
  authenticate,
  requirePermission(P.ALERT_ACK),
  asyncHandler((req, res) => {
    const alert = get('SELECT * FROM alerts WHERE id = ?', req.params.id);
    if (!alert) throw new HttpError(404, 'Alert not found');
    if (!canAccessAlert(req.user, alert)) throw new HttpError(403, 'Not your alert');
    run(`UPDATE alerts SET status = 'acknowledged', read_at = COALESCE(read_at, ?) WHERE id = ?`, nowIso(), alert.id);
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'ALERT_ACKNOWLEDGED', entity: 'alert', entityId: alert.id });
    res.json({ alert: get('SELECT * FROM alerts WHERE id = ?', alert.id) });
  })
);

export default router;
