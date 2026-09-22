import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute, { ROLE_HOME } from './components/ProtectedRoute.jsx';
import { useAuth } from './auth.jsx';

import Login from './pages/Login.jsx';
import EmergencyIntake from './pages/EmergencyIntake.jsx';
import TrackStatus from './pages/TrackStatus.jsx';
import DoctorDashboard from './pages/DoctorDashboard.jsx';
import PatientDashboard from './pages/PatientDashboard.jsx';
import ReceptionDashboard from './pages/ReceptionDashboard.jsx';
import ReceptionPatients from './pages/ReceptionPatients.jsx';
import WardDashboard from './pages/WardDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AdminManage from './pages/AdminManage.jsx';
import PharmacyDashboard from './pages/PharmacyDashboard.jsx';

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Layout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/track" element={<TrackStatus />} />
        <Route
          path="/emergency"
          element={<ProtectedRoute roles={['reception']}><EmergencyIntake /></ProtectedRoute>}
        />

        <Route
          path="/doctor"
          element={<ProtectedRoute roles={['doctor']}><DoctorDashboard /></ProtectedRoute>}
        />
        <Route
          path="/patient"
          element={<ProtectedRoute roles={['patient']}><PatientDashboard /></ProtectedRoute>}
        />
        <Route
          path="/reception"
          element={<ProtectedRoute roles={['reception', 'admin']}><ReceptionDashboard /></ProtectedRoute>}
        />
        <Route
          path="/reception/patients"
          element={<ProtectedRoute roles={['reception', 'admin']}><ReceptionPatients /></ProtectedRoute>}
        />
        <Route
          path="/ward"
          element={<ProtectedRoute roles={['ward_staff', 'admin']}><WardDashboard /></ProtectedRoute>}
        />
        <Route
          path="/admin"
          element={<ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>}
        />
        <Route
          path="/admin/users"
          element={<ProtectedRoute roles={['admin']}><AdminManage /></ProtectedRoute>}
        />
        <Route
          path="/pharmacy"
          element={<ProtectedRoute roles={['pharmacist', 'admin']}><PharmacyDashboard /></ProtectedRoute>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
