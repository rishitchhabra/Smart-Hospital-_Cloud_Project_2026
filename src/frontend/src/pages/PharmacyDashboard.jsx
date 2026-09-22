import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Badge, Loading, useToast, EmptyState, fmtTime } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const TABS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'dispensed', label: 'Dispensed' },
];

const NEXT = { pending: 'preparing', preparing: 'ready', ready: 'dispensed' };
const ACTION_LABEL = { pending: 'Start preparing', preparing: 'Mark ready', ready: 'Mark dispensed' };

export default function PharmacyDashboard() {
  const { push } = useToast();
  const [tab, setTab] = useState('');
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get('/pharmacy/prescriptions');
      setAll(data.prescriptions);
    } catch (err) {
      if (!silent) push(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 12000);
    return () => clearInterval(t);
  }, [load]);

  const list = useMemo(() => (tab ? all.filter((p) => p.fulfillment_status === tab) : all), [all, tab]);

  const counts = useMemo(() => ({
    pending: all.filter((p) => p.fulfillment_status === 'pending').length,
    preparing: all.filter((p) => p.fulfillment_status === 'preparing').length,
    ready: all.filter((p) => p.fulfillment_status === 'ready').length,
    emergency: all.filter((p) => p.isEmergency && p.fulfillment_status !== 'dispensed').length,
  }), [all]);

  const advance = async (rx) => {
    const next = NEXT[rx.fulfillment_status];
    if (!next) return;
    setBusyId(rx.id);
    try {
      await api.patch(`/pharmacy/prescriptions/${rx.id}`, { status: next });
      push(`Marked ${next}`, 'success');
      await load(true);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Pharmacy</div>
          <h1 className="section-title"><Icon name="package" size={22} /> Prescription queue</h1>
          <p className="muted" style={{ margin: 0 }}>Emergency prescriptions are highlighted and notified instantly.</p>
        </div>
        <button className="btn ghost" onClick={() => load()}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      <div className="grid cols-4">
        <div className="stat warn"><div className="label">Pending</div><div className="value">{counts.pending}</div></div>
        <div className="stat info"><div className="label">Preparing</div><div className="value">{counts.preparing}</div></div>
        <div className="stat ok"><div className="label">Ready</div><div className="value">{counts.ready}</div></div>
        <div className="stat danger"><div className="label">Emergency open</div><div className="value">{counts.emergency}</div></div>
      </div>

      <div className="row wrap gap-sm">
        {TABS.map((t) => (
          <button key={t.key} className={`btn sm ${tab === t.key ? 'primary' : 'ghost'}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : !list.length ? (
        <div className="card"><EmptyState icon="package" title="No prescriptions in this queue" hint="New prescriptions appear here when a doctor adds them." /></div>
      ) : (
        <div className="grid auto-lg">
          {list.map((rx) => (
            <div key={rx.id} className={`queue-card ${rx.isEmergency ? 'emergency' : 'opd'}`}>
              <div className="row between">
                <div className="row gap-sm">
                  {rx.isEmergency ? (
                    <Badge tone="red" dot>EMERGENCY</Badge>
                  ) : <Badge tone="blue">OPD</Badge>}
                  <Badge tone={rx.fulfillment_status === 'ready' ? 'green' : rx.fulfillment_status === 'dispensed' ? 'gray' : 'amber'}>
                    {rx.fulfillment_status}
                  </Badge>
                </div>
                <span className="tiny muted">{fmtTime(rx.created_at)}</span>
              </div>

              <div className="mt-1">
                <b>{rx.patient_name}</b>
                <div className="tiny muted">{rx.patient_code} · Dr. {rx.doctor_name || '—'} · {rx.specialization || ''}</div>
                {rx.diagnosis ? <div className="small mt-1">{rx.diagnosis}</div> : null}
              </div>

              <div className="stack mt-1" style={{ gap: '0.4rem' }}>
                {rx.items.map((it) => (
                  <div key={it.id} className="med-card">
                    <div className="row between">
                      <span className="name">{it.medicine_name}</span>
                      <span className="pill teal">{it.dosage}</span>
                    </div>
                    <div className="tiny muted">
                      {it.frequency} · {it.duration} · {it.before_after_food || 'anytime'}
                      {it.schedule?.text ? ` · ${it.schedule.text}` : ''}
                    </div>
                  </div>
                ))}
              </div>

              {NEXT[rx.fulfillment_status] ? (
                <button className="btn primary block mt-2" disabled={busyId === rx.id} onClick={() => advance(rx)}>
                  {busyId === rx.id ? 'Updating…' : ACTION_LABEL[rx.fulfillment_status]}
                </button>
              ) : (
                <div className="badge green mt-2" style={{ width: 'fit-content' }}>Dispensed{rx.dispensed_at ? ` ${fmtTime(rx.dispensed_at)}` : ''}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
