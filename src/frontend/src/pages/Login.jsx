import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ROLE_HOME } from '../components/ProtectedRoute.jsx';
import { useToast } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

// Shown immediately (and if the API is unreachable) so demo logins are always
// one click away. Mirrors the seeded accounts.
const FALLBACK_DEMO = [
  { username: 'admin', password: 'Admin@123', name: 'System Administrator', role: 'admin' },
  { username: 'reception', password: 'Reception@123', name: 'Rachel Greene', role: 'reception' },
  { username: 'ward', password: 'Ward@123', name: 'Nurse Emily Carter', role: 'ward_staff' },
  { username: 'pharmacy', password: 'Pharmacy@123', name: 'Pharmacist Maya Lin', role: 'pharmacist' },
  { username: 'dr.arjun', password: 'Doctor@123', name: 'Dr. Arjun Mehta', role: 'doctor' },
  { username: 'dr.priya', password: 'Doctor@123', name: 'Dr. Priya Nair', role: 'doctor' },
  { username: 'dr.meera', password: 'Doctor@123', name: 'Dr. Meera Joshi', role: 'doctor' },
  { username: 'dr.sneha', password: 'Doctor@123', name: 'Dr. Sneha Kapoor', role: 'doctor' },
  { username: 'dr.ananya', password: 'Doctor@123', name: 'Dr. Ananya Iyer', role: 'doctor' },
  { username: 'dr.karan', password: 'Doctor@123', name: 'Dr. Karan Shah', role: 'doctor' },
];

export default function Login() {
  const { login, patientAccess, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();

  const [mode, setMode] = useState('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [patientId, setPatientId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(FALLBACK_DEMO);
  const [apiOffline, setApiOffline] = useState(false);

  useEffect(() => {
    api.get('/meta', { auth: false })
      .then((d) => { if (d.demoAccounts?.length) setDemo(d.demoAccounts); setApiOffline(false); })
      .catch(() => setApiOffline(true));
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(location.state?.from || ROLE_HOME[user.role] || '/', { replace: true });
    }
  }, [isAuthenticated, user, navigate, location.state]);

  const submitStaff = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      push(`Welcome, ${u.name}`, 'success');
      navigate(location.state?.from || ROLE_HOME[u.role] || '/', { replace: true });
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitPatient = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await patientAccess(patientId.trim(), accessCode.trim());
      push(`Welcome, ${u.name}`, 'success');
      navigate('/patient', { replace: true });
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fill = (d) => {
    setMode('staff');
    setUsername(d.username);
    setPassword(d.password);
    push(`Filled ${d.username} — press Sign in`, 'info');
  };

  return (
    <div className="login-shell">
      <div className="login-hero">
        <span className="pill">Multi-Agent AI · Serverless Workflow</span>
        <h1>Emergency care coordination in seconds.</h1>
        <p style={{ maxWidth: 520, fontSize: '1.02rem' }}>
          Describe an emergency in plain language. Our coordinator agent runs triage, reserves a bed,
          assigns the right doctor and alerts staff — before paperwork.
        </p>
        <div className="hero-flow">
          {['Emergency Chat', 'AI Triage', 'Emergency ID', 'Bed Allocation', 'Doctor Assignment', 'Doctor Alert', 'Staff Alert', 'Admission'].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>

      <div className="login-panel">
        <div className="login-box stack">
          <div>
            <h2 style={{ marginBottom: 2 }}>Sign in</h2>
            <p className="muted small">Role-based access for hospital staff and patients.</p>
          </div>

          {apiOffline ? (
            <div className="card" style={{ borderLeft: '4px solid var(--red-500)', background: 'var(--red-50)', boxShadow: 'none' }}>
              <div className="row gap-sm">
                <Icon name="alert-triangle" size={16} />
                <span className="small"><b>API offline.</b> The backend on port 4000 isn't responding. Run <code>npm run dev</code> and refresh.</span>
              </div>
            </div>
          ) : null}

          <div className="row gap-sm">
            <button className={`btn sm ${mode === 'staff' ? 'primary' : 'ghost'}`} onClick={() => setMode('staff')}>Staff</button>
            <button className={`btn sm ${mode === 'patient' ? 'primary' : 'ghost'}`} onClick={() => setMode('patient')}>Patient / Attendant</button>
          </div>

          {mode === 'staff' ? (
            <form className="stack" onSubmit={submitStaff}>
              <div className="field">
                <label>Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="e.g. dr.arjun" required />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
              <button className="btn primary block lg" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </form>
          ) : (
            <form className="stack" onSubmit={submitPatient}>
              <div className="field">
                <label>Patient ID or Emergency ID</label>
                <input value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="PAT-123456 or EMG-XXXXXX" required />
              </div>
              <div className="field">
                <label>Access code</label>
                <input value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="6-digit code" required />
              </div>
              <button className="btn primary block lg" disabled={busy}>{busy ? 'Checking…' : 'View my records'}</button>
              <p className="small muted">Access code is issued with your Emergency ID. Ask reception if you lost it.</p>
            </form>
          )}

          <div className="divider" />
          <div>
            <div className="row between mb-1">
              <b className="small">Quick demo login</b>
              <span className="tiny muted">click to fill</span>
            </div>
            <div className="demo-accounts">
              {demo.map((d) => (
                <button key={d.username} type="button" className="demo-account" onClick={() => fill(d)}>
                  <span><b>{d.username}</b> · <span className="muted">{d.name}</span></span>
                  <span className="row gap-sm">
                    <span className="badge gray">{d.role.replace('_', ' ')}</span>
                    <Icon name="log-out" size={14} />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="small muted center">
            Emergency intake is handled by reception staff. Already registered?{' '}
            <Link to="/track">Track your emergency status</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
