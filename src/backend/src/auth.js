import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { get } from './db.js';
import { hasAnyPermission, hasPermission, permissionsForRole } from './permissions.js';

const JWT_SECRET = process.env.JWT_SECRET || 'medagentx-dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '12h';

export function signToken(user) {
  const payload = {
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    doctorId: user.doctor_id || null,
    staffId: user.staff_id || null,
    patientId: user.patient_id || null,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function authenticateUser(username, password) {
  const user = get('SELECT * FROM users WHERE username = ? AND active = 1', username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  return user;
}

/** Express middleware: requires a valid bearer token. */
export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = verifyToken(token);
    payload.id = payload.sub; // convenience alias used across routes
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/** Express middleware factory: requires one of the given roles. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    return next();
  };
}

/**
 * Express middleware factory: requires all of the given permissions.
 * Enforced server-side regardless of what the frontend shows.
 */
export function requirePermission(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const ok = perms.every((p) => hasPermission(req.user.role, p));
    if (!ok) return res.status(403).json({ error: 'Forbidden: missing permission' });
    return next();
  };
}

/** Express middleware factory: requires any one of the given permissions. */
export function requireAnyPermission(...perms) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!hasAnyPermission(req.user.role, perms)) {
      return res.status(403).json({ error: 'Forbidden: missing permission' });
    }
    return next();
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    doctorId: user.doctor_id || null,
    staffId: user.staff_id || null,
    patientId: user.patient_id || null,
  };
}

export { permissionsForRole };
