import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Icon from './Icon.jsx';

/* ------------------------------ Formatting ------------------------------- */

export function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtClock(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export const statusTone = {
  EMERGENCY_DETECTED: 'red',
  BED_RESERVED: 'amber',
  DOCTOR_ASSIGNED: 'blue',
  STAFF_ALERTED: 'amber',
  PATIENT_ARRIVED: 'teal',
  ADMITTED: 'green',
  CANCELLED: 'gray',
};

export const statusLabel = {
  EMERGENCY_DETECTED: 'Emergency Detected',
  BED_RESERVED: 'Bed Reserved',
  DOCTOR_ASSIGNED: 'Doctor Assigned',
  STAFF_ALERTED: 'Staff Alerted',
  PATIENT_ARRIVED: 'Patient Arrived',
  ADMITTED: 'Admitted',
  CANCELLED: 'Cancelled',
};

export const urgencyTone = { critical: 'red', high: 'amber', moderate: 'blue', low: 'gray' };

/* -------------------------------- Atoms ---------------------------------- */

export function Badge({ tone = 'gray', dot = false, children }) {
  return <span className={`badge ${tone}${dot ? ' dot' : ''}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone[status] || 'gray'} dot>{statusLabel[status] || status}</Badge>;
}

export function Stat({ label, value, sub, tone = 'accent' }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="empty">
      <div className="spinner" />
      <div className="small muted mt-1">{label}</div>
    </div>
  );
}

export function EmptyState({ icon = 'inbox', title, hint }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <div style={{ fontWeight: 600, color: 'var(--slate-700)' }}>{title}</div>
      {hint ? <div className="small muted mt-1">{hint}</div> : null}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={wide ? { width: 'min(980px, 100%)' } : undefined}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/* -------------------------------- Toast ---------------------------------- */

const ToastContext = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
