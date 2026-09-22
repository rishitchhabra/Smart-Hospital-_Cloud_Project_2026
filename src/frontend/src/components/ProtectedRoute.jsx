import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const ROLE_HOME = {
  admin: '/admin',
  reception: '/reception',
  ward_staff: '/ward',
  doctor: '/doctor',
  pharmacist: '/pharmacy',
  patient: '/patient',
};

export default function ProtectedRoute({ roles, permissions, anyPermission, children }) {
  const { isAuthenticated, user, can, canAny } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }

  if (permissions && !permissions.every((p) => can(p))) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }

  if (anyPermission && !canAny(anyPermission)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }

  return children;
}

export { ROLE_HOME };
