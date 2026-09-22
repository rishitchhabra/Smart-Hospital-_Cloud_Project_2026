import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtTime, useToast } from './ui.jsx';
import Icon from './Icon.jsx';

const ROLE_HOME = {
  admin: { to: '/admin', label: 'Admin' },
  reception: { to: '/reception', label: 'Reception' },
  ward_staff: { to: '/ward', label: 'Ward' },
  doctor: { to: '/doctor', label: 'My Patients' },
  pharmacist: { to: '/pharmacy', label: 'Pharmacy' },
  patient: { to: '/patient', label: 'My Health' },
};

const ROLE_LINKS = {
  reception: [{ to: '/emergency', label: 'Emergency & Appointments', icon: 'activity' }],
  doctor: [],
  ward_staff: [],
  pharmacist: [],
  patient: [],
  admin: [],
};

/* ------------------------------ Alarm sound ------------------------------ */

function useBeeper() {
  const ctxRef = useRef(null);
  const intervalRef = useRef(null);

  const prime = useCallback(() => {
    try {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
      return true;
    } catch {
      return false;
    }
  }, []);

  const beep = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.28);
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.value = 1046;
      g2.gain.value = 0.12;
      osc2.connect(g2).connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.2);
    }, 320);
  }, []);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    if (prime()) beep();
    intervalRef.current = setInterval(beep, 1100);
  }, [beep, prime]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return useMemo(() => ({ prime, start, stop }), [prime, start, stop]);
}

/* ------------------------------ Alert drawer ----------------------------- */

function AlertDrawer({ onClose }) {
  const { canAny } = useAuth();
  const { push } = useToast();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/alerts');
      setAlerts(data.alerts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (a) => {
    if (a.status !== 'unread') return;
    try {
      await api.post(`/alerts/${a.id}/read`);
      setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, status: 'read' } : x)));
    } catch (e) { push(e.message, 'error'); }
  };

  const ack = async (a) => {
    try {
      await api.post(`/alerts/${a.id}/ack`);
      setAlerts((list) => list.map((x) => (x.id === a.id ? { ...x, status: 'acknowledged' } : x)));
      push('Alert acknowledged', 'success');
    } catch (e) { push(e.message, 'error'); }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <h3 style={{ margin: 0 }} className="section-title"><Icon name="bell" size={18} /> Alerts</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-body">
          {loading ? <div className="spinner" /> : null}
          {!loading && alerts.length === 0 ? <p className="muted small">No alerts right now.</p> : null}
          {alerts.map((a) => (
            <div key={a.id} className={`alert-item ${a.status === 'unread' ? 'unread' : ''} ${a.severity}`} onClick={() => markRead(a)}>
              <div className="grow">
                <div className="row between">
                  <b className="small">{a.title}</b>
                  <span className="tiny muted nowrap">{fmtTime(a.created_at)}</span>
                </div>
                <div className="msg mt-1">{a.message}</div>
                <div className="row gap-sm mt-1">
                  {a.status === 'unread' ? <span className="badge teal">New</span> : null}
                  {a.status === 'acknowledged' ? <span className="badge green">Acknowledged</span> : null}
                  {canAny(['alert:ack']) && a.status !== 'acknowledged' ? (
                    <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); ack(a); }}>Acknowledge</button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------ Emergency alarm -------------------------- */

function EmergencyAlarm({ alert, soundOn, onEnableSound, onAck }) {
  return (
    <div className="alarm-backdrop">
      <div className="alarm-box">
        <div className="alarm-head">
          <span className="alarm-pulse" />
          <Icon name="alert-octagon" size={22} />
          <span style={{ flex: 1 }}>EMERGENCY ALERT</span>
          <span className="tiny" style={{ fontWeight: 600 }}>{fmtTime(alert.created_at)}</span>
        </div>
        <div className="modal-body">
          <h3 style={{ marginTop: 0 }}>{alert.title}</h3>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.92rem', color: 'var(--slate-700)', margin: 0 }}>{alert.message}</pre>
          {!soundOn ? (
            <button className="btn ghost sm mt-2" onClick={onEnableSound}>Enable alarm sound and vibration</button>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn danger lg" onClick={onAck}>
            <Icon name="check" size={16} /> Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Layout -------------------------------- */

export default function Layout() {
  const { user, logout, canAny } = useAuth();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('medagentx_alarm') === 'on');
  const beeper = useBeeper();

  const home = user ? ROLE_HOME[user.role] : null;
  const isDoctor = user?.role === 'doctor';

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [count, list] = await Promise.all([
        api.get('/alerts/unread-count'),
        isDoctor ? api.get('/alerts') : Promise.resolve({ alerts: [] }),
      ]);
      setUnread(count.count);
      if (isDoctor) setAlerts(list.alerts || []);
    } catch { /* ignore */ }
  }, [user, isDoctor]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, isDoctor ? 8000 : 15000);
    return () => clearInterval(t);
  }, [refresh, drawer, isDoctor]);

  // Doctor alarm: loud, repeating until acknowledged.
  const activeEmergencyAlert = isDoctor
    ? alerts.find((a) => a.type === 'doctor_alert' && a.status === 'unread') ||
      alerts.find((a) => a.type === 'admission_alert' && a.status === 'unread')
    : null;

  useEffect(() => {
    if (activeEmergencyAlert && soundOn) {
      beeper.start();
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 600]);
    } else {
      beeper.stop();
    }
    return () => beeper.stop();
  }, [activeEmergencyAlert, soundOn, beeper]);

  const toggleSound = () => {
    if (soundOn) {
      localStorage.setItem('medagentx_alarm', 'off');
      setSoundOn(false);
      beeper.stop();
    } else {
      beeper.prime();
      localStorage.setItem('medagentx_alarm', 'on');
      setSoundOn(true);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  };

  const ackAlarm = async () => {
    if (!activeEmergencyAlert) return;
    try {
      await api.post(`/alerts/${activeEmergencyAlert.id}/ack`);
    } catch { /* ignore */ }
    beeper.stop();
    await refresh();
  };

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  const links = user ? (ROLE_LINKS[user.role] || []) : [];

  return (
    <div className="app">
      <header className="navbar">
        <div className="navbar-inner">
          <NavLink to={home?.to || '/login'} className="brand">
            <span className="brand-mark">M</span>
            <span>MedAgentX<small>Smart Hospital · Multi-Agent AI</small></span>
          </NavLink>

          <nav className="nav-links">
            {links.map((l) => (
              <NavLink key={l.to} className="nav-link" to={l.to}>
                <span className="icon-text"><Icon name={l.icon} size={15} /> {l.label}</span>
              </NavLink>
            ))}
            <NavLink className="nav-link" to="/track"><span className="icon-text"><Icon name="search" size={15} /> Track Status</span></NavLink>
            {home ? <NavLink className="nav-link" to={home.to}>{home.label}</NavLink> : null}
            {user?.role === 'reception' ? <NavLink className="nav-link" to="/reception/patients">Patients</NavLink> : null}
            {user?.role === 'admin' ? <NavLink className="nav-link" to="/admin/users">Manage</NavLink> : null}
          </nav>

          <div className="nav-right">
            {user ? (
              <>
                {isDoctor ? (
                  <button
                    className={`btn sm ${soundOn ? 'ghost' : 'primary'}`}
                    title="Enable or disable the emergency alarm sound"
                    onClick={toggleSound}
                  >
                    <Icon name={soundOn ? 'bell-ring' : 'bell'} size={14} /> {soundOn ? 'Alarm on' : 'Enable alarm'}
                  </button>
                ) : null}
                <button className="bell" title="Alerts" onClick={() => setDrawer(true)}>
                  <Icon name="bell" size={19} />
                  {unread > 0 ? <span className="count">{unread > 9 ? '9+' : unread}</span> : null}
                </button>
                <div className="user-chip">
                  <div>
                    <div className="small" style={{ fontWeight: 700, lineHeight: 1.1 }}>{user.name}</div>
                    <div className="tiny muted" style={{ textTransform: 'capitalize' }}>{user.role.replace('_', ' ')}</div>
                  </div>
                  <div className="avatar">{user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}</div>
                </div>
                <button className="btn ghost sm" onClick={doLogout}><Icon name="log-out" size={15} /></button>
              </>
            ) : (
              <NavLink className="btn primary sm" to="/login">Staff / Patient Login</NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      {drawer ? <AlertDrawer onClose={() => setDrawer(false)} /> : null}
      {activeEmergencyAlert ? (
        <EmergencyAlarm
          alert={activeEmergencyAlert}
          soundOn={soundOn}
          onEnableSound={toggleSound}
          onAck={ackAlarm}
        />
      ) : null}
    </div>
  );
}

export { ROLE_HOME };
