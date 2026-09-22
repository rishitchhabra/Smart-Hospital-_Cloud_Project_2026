import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, get, run } from '../db.js';
import { authenticate, requirePermission, requireAnyPermission } from '../auth.js';
import { PERMISSIONS as P, ROLE_PERMISSIONS, ROLES } from '../permissions.js';
import { asyncHandler, HttpError, requireFields } from '../http.js';
import { nowIso, newId, logActivity } from '../utils.js';

const router = Router();

/* --------------------------- Operational overview ------------------------ */

router.get(
  '/overview',
  authenticate,
  requirePermission(P.ANALYTICS_READ),
  asyncHandler((req, res) => {
    const one = (sql, ...params) => get(sql, ...params)?.c ?? 0;

    const totals = {
      patients: one('SELECT COUNT(*) AS c FROM patients'),
      emergencies: one('SELECT COUNT(*) AS c FROM emergencies'),
      activeAdmissions: one(`SELECT COUNT(*) AS c FROM admissions WHERE status != 'discharged'`),
      pendingEmergencies: one(`SELECT COUNT(*) AS c FROM emergencies WHERE status NOT IN ('ADMITTED','CANCELLED')`),
      criticalEmergencies: one(`SELECT COUNT(*) AS c FROM emergencies WHERE urgency = 'critical' AND status NOT IN ('ADMITTED','CANCELLED')`),
      availableBeds: one(`SELECT COUNT(*) AS c FROM beds WHERE status = 'available'`),
      occupiedBeds: one(`SELECT COUNT(*) AS c FROM beds WHERE status = 'occupied'`),
      reservedBeds: one(`SELECT COUNT(*) AS c FROM beds WHERE status = 'reserved'`),
      totalBeds: one('SELECT COUNT(*) AS c FROM beds'),
      availableDoctors: one(`SELECT COUNT(*) AS c FROM doctors WHERE availability = 'available'`),
      totalDoctors: one('SELECT COUNT(*) AS c FROM doctors'),
      onDutyStaff: one(`SELECT COUNT(*) AS c FROM staff WHERE status = 'on_duty'`),
      totalStaff: one('SELECT COUNT(*) AS c FROM staff'),
      users: one('SELECT COUNT(*) AS c FROM users WHERE active = 1'),
      prescriptions: one('SELECT COUNT(*) AS c FROM prescriptions'),
      opdPatients: one(`SELECT COUNT(*) AS c FROM patients WHERE patient_type = 'opd'`),
      appointments: one(`SELECT COUNT(*) AS c FROM appointments WHERE status = 'scheduled'`),
      pendingPharmacy: one(`SELECT COUNT(*) AS c FROM prescriptions WHERE fulfillment_status IN ('pending','preparing')`),
      onDutyDoctors: one(`SELECT COUNT(*) AS c FROM doctors WHERE availability = 'available'`),
    };

    const bedInventory = all(
      `SELECT w.name AS ward_name, w.type AS ward_type,
              SUM(CASE WHEN b.status='available' THEN 1 ELSE 0 END) AS available,
              SUM(CASE WHEN b.status='occupied' THEN 1 ELSE 0 END) AS occupied,
              SUM(CASE WHEN b.status='reserved' THEN 1 ELSE 0 END) AS reserved,
              COUNT(*) AS total
         FROM wards w LEFT JOIN beds b ON b.ward_id = w.id
        GROUP BY w.id ORDER BY w.name`
    );

    const emergencyByStatus = all(
      `SELECT status, COUNT(*) AS count FROM emergencies GROUP BY status ORDER BY count DESC`
    );

    const emergenciesByDepartment = all(
      `SELECT required_department AS department, COUNT(*) AS count
         FROM emergencies GROUP BY required_department ORDER BY count DESC`
    );

    const recentAlerts = all(`SELECT * FROM alerts ORDER BY datetime(created_at) DESC LIMIT 12`);
    const recentEmergencies = all(`SELECT * FROM emergencies ORDER BY datetime(created_at) DESC LIMIT 8`);
    const recentActivity = all(`SELECT * FROM activity_logs ORDER BY datetime(created_at) DESC LIMIT 15`);

    const agents = [
      { name: 'Coordinator Agent', role: 'Orchestrator', status: 'online' },
      { name: 'Triage Agent', role: 'NLP · urgency & specialisation', status: 'online' },
      { name: 'Bed Allocation Agent', role: 'Bed matching & reservation', status: totals.availableBeds > 0 ? 'online' : 'degraded' },
      { name: 'Doctor Assignment Agent', role: 'Availability-aware matching', status: totals.availableDoctors > 0 ? 'online' : 'degraded' },
      { name: 'Notification Agent', role: 'Doctor & staff alerts', status: 'online' },
      { name: 'Admission Agent', role: 'Emergency → patient record', status: 'online' },
    ];

    res.json({
      totals,
      bedInventory,
      emergencyByStatus,
      emergenciesByDepartment,
      recentAlerts,
      recentEmergencies,
      recentActivity,
      agents,
    });
  })
);

router.get(
  '/activity',
  authenticate,
  requirePermission(P.AUDIT_READ),
  asyncHandler((req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json({
      activity: all(
        `SELECT l.*, u.name AS actor_name FROM activity_logs l
           LEFT JOIN users u ON u.id = l.actor_user_id
          ORDER BY datetime(l.created_at) DESC LIMIT ?`,
        limit
      ),
    });
  })
);

router.get(
  '/permissions',
  authenticate,
  requirePermission(P.USER_MANAGE),
  asyncHandler((req, res) => {
    res.json({ roles: Object.keys(ROLE_PERMISSIONS), permissions: ROLE_PERMISSIONS });
  })
);

/* ------------------------------- User admin ------------------------------ */

router.get(
  '/users',
  authenticate,
  requirePermission(P.USER_MANAGE),
  asyncHandler((req, res) => {
    res.json({
      users: all(
        `SELECT u.id, u.username, u.name, u.email, u.phone, u.role, u.doctor_id, u.staff_id, u.patient_id, u.active, u.created_at,
                d.name AS doctor_name, s.name AS staff_name
           FROM users u
           LEFT JOIN doctors d ON d.id = u.doctor_id
           LEFT JOIN staff s ON s.id = u.staff_id
          ORDER BY u.role, u.name`
      ),
    });
  })
);

router.post(
  '/users',
  authenticate,
  requirePermission(P.USER_MANAGE),
  asyncHandler((req, res) => {
    requireFields(req.body, ['username', 'password', 'name', 'role']);
    if (!Object.values(ROLES).includes(req.body.role)) throw new HttpError(400, 'Invalid role');
    if (get('SELECT 1 AS x FROM users WHERE username = ?', req.body.username)) {
      throw new HttpError(409, 'Username already exists');
    }
    const id = newId('USR');
    run(
      `INSERT INTO users (id, username, password_hash, name, email, phone, role, doctor_id, staff_id, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      req.body.username,
      bcrypt.hashSync(req.body.password, 10),
      req.body.name,
      req.body.email || null,
      req.body.phone || null,
      req.body.role,
      req.body.doctorId || null,
      req.body.staffId || null,
      req.body.active === false ? 0 : 1,
      nowIso()
    );
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'USER_CREATED', entity: 'user', entityId: id, details: { role: req.body.role } });
    res.status(201).json({ user: get('SELECT id, username, name, role, active FROM users WHERE id = ?', id) });
  })
);

router.patch(
  '/users/:id',
  authenticate,
  requirePermission(P.USER_MANAGE),
  asyncHandler((req, res) => {
    const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    const sets = [];
    const vals = [];
    for (const key of ['name', 'email', 'phone', 'role', 'doctor_id', 'staff_id', 'active']) {
      if (req.body[key] !== undefined) {
        sets.push(`${key} = ?`);
        vals.push(key === 'active' ? (req.body.active ? 1 : 0) : req.body[key]);
      }
    }
    if (req.body.password) {
      sets.push('password_hash = ?');
      vals.push(bcrypt.hashSync(req.body.password, 10));
    }
    if (!sets.length) throw new HttpError(400, 'No changes supplied');
    vals.push(user.id);
    run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'USER_UPDATED', entity: 'user', entityId: user.id });
    res.json({ user: get('SELECT id, username, name, email, phone, role, active FROM users WHERE id = ?', user.id) });
  })
);

router.delete(
  '/users/:id',
  authenticate,
  requirePermission(P.USER_MANAGE),
  asyncHandler((req, res) => {
    if (req.params.id === req.user.sub) throw new HttpError(400, 'You cannot delete your own account');
    const user = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!user) throw new HttpError(404, 'User not found');
    run('UPDATE users SET active = 0 WHERE id = ?', user.id);
    logActivity({ actorUserId: req.user.id, actorRole: req.user.role, action: 'USER_DISABLED', entity: 'user', entityId: user.id });
    res.json({ ok: true });
  })
);

export default router;
