import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Loading, StatusBadge, useToast, urgencyTone, fmtTime } from '../components/ui.jsx';
import StatusTimeline from '../components/StatusTimeline.jsx';
import Icon from '../components/Icon.jsx';

const ACTIVE = ['EMERGENCY_DETECTED', 'BED_RESERVED', 'DOCTOR_ASSIGNED', 'STAFF_ALERTED', 'PATIENT_ARRIVED'];

export default function WardDashboard() {
  const { push } = useToast();
  const [emergencies, setEmergencies] = useState([]);
  const [beds, setBeds] = useState({ beds: [], inventory: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [e, b] = await Promise.all([api.get('/emergency'), api.get('/beds')]);
      setEmergencies(e.emergencies);
      setBeds(b);
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

  const act = async (id, action, body) => {
    setBusyId(id + action);
    try {
      if (action === 'prepare' || action === 'arrive') {
        await api.post(`/emergency/${id}/${action}`);
        push(action === 'prepare' ? 'Bed marked prepared' : 'Patient marked arrived', 'success');
      } else if (action === 'admit') {
        await api.post(`/emergency/${id}/admit`, body || {});
        push('Admission confirmed', 'success');
      } else if (action === 'bed') {
        await api.patch(`/beds/${id}`, body);
        push('Bed status updated', 'success');
      }
      await load(true);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const incoming = emergencies.filter((e) => ACTIVE.includes(e.status));
  const completed = emergencies.filter((e) => !ACTIVE.includes(e.status));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Emergency / Ward Staff</div>
          <h1>Ward operations</h1>
          <p className="muted" style={{ margin: 0 }}>Incoming emergencies, bed preparation and admission confirmation.</p>
        </div>
        <button className="btn ghost" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid cols-4">
        <div className="stat danger"><div className="label">Incoming</div><div className="value">{incoming.length}</div><div className="sub">awaiting preparation / arrival</div></div>
        <div className="stat accent"><div className="label">Available beds</div><div className="value">{beds.inventory.reduce((s, w) => s + w.available, 0)}</div><div className="sub">across all wards</div></div>
        <div className="stat warn"><div className="label">Reserved</div><div className="value">{beds.inventory.reduce((s, w) => s + w.reserved, 0)}</div><div className="sub">held for emergencies</div></div>
        <div className="stat ok"><div className="label">Occupied</div><div className="value">{beds.inventory.reduce((s, w) => s + w.occupied, 0)}</div><div className="sub">beds in use</div></div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <h2 style={{ margin: 0 }}>Incoming emergency alerts</h2>
          {loading ? <Loading /> : null}
          {!loading && incoming.length === 0 ? (
            <div className="card empty">
              <div className="empty-icon"><Icon name="check-circle" size={26} /></div>
              <div>No incoming emergencies right now.</div>
            </div>
          ) : null}
          {incoming.map((e) => (
            <div key={e.id} className="card" style={{ borderLeft: `5px solid ${e.urgency === 'critical' ? 'var(--red-500)' : 'var(--amber-500)'}` }}>
              <div className="row between">
                <div>
                  <b style={{ fontSize: '1.05rem' }}>{e.id}</b>
                  <div className="tiny muted">{fmtTime(e.created_at)} · {e.urgency?.toUpperCase()} · triage {e.triage_level}</div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
                  <StatusBadge status={e.status} />
                  <button className="btn ghost sm" onClick={() => setSelected(e)}>Details</button>
                </div>
              </div>

              <div className="grid cols-2 mt-1">
                <div><div className="tiny muted">WARD / BED</div><b>{e.ward ? `${e.ward.name} · ${e.bed?.bed_number}` : 'Pending'}</b></div>
                <div><div className="tiny muted">ASSIGNED DOCTOR</div><b>{e.doctor?.name || 'Pending'}</b></div>
              </div>

              <div className="mt-1">
                <div className="tiny muted">REQUIRED PREPARATION</div>
                <div className="row wrap gap-sm mt-1">
                  {(e.recommended_actions || []).slice(0, 3).map((a) => <span key={a} className="pill">{a}</span>)}
                </div>
              </div>

              <div className="row wrap gap-sm mt-2">
                <button
                  className="btn primary sm"
                  disabled={busyId === e.id + 'prepare' || Boolean(e.timestamps?.BED_PREPARED)}
                  onClick={() => act(e.id, 'prepare')}
                >
                  {e.timestamps?.BED_PREPARED ? <><Icon name="check" size={15} /> Bed prepared</> : 'Mark bed prepared'}
                </button>
                <button
                  className="btn sm"
                  disabled={busyId === e.id + 'arrive' || Boolean(e.timestamps?.PATIENT_ARRIVED)}
                  onClick={() => act(e.id, 'arrive')}
                >
                  {e.timestamps?.PATIENT_ARRIVED ? <><Icon name="check" size={15} /> Patient arrived</> : 'Mark patient arrived'}
                </button>
                <button
                  className="btn sm"
                  disabled={busyId === e.id + 'admit'}
                  onClick={() => act(e.id, 'admit')}
                >
                  Confirm admission
                </button>
              </div>
              {!e.patient ? (
                <p className="tiny muted mt-1" style={{ marginBottom: 0 }}>
                  Note: registration pending at reception. Confirming now creates a temporary unidentified record.
                </p>
              ) : null}
            </div>
          ))}

          {completed.length ? (
            <>
              <h2 className="mt-2" style={{ margin: 0 }}>Recently completed</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Emergency</th><th>Patient</th><th>Doctor</th><th>Status</th></tr></thead>
                  <tbody>
                    {completed.slice(0, 8).map((e) => (
                      <tr key={e.id}>
                        <td><b>{e.id}</b></td>
                        <td>{e.patient?.name || '—'}</td>
                        <td>{e.doctor?.name || '—'}</td>
                        <td><StatusBadge status={e.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>

        <div className="stack">
          <h2 style={{ margin: 0 }}>Bed occupancy</h2>
          {beds.inventory.map((w) => (
            <div key={w.ward_id} className="card">
              <div className="row between mb-1">
                <b>{w.ward_name}</b>
                <span className="tiny muted">{w.available} available / {w.total} total</span>
              </div>
              <div className="row wrap gap-sm">
                {beds.beds.filter((b) => b.ward_id === w.ward_id).map((b) => (
                  <button
                    key={b.id}
                    title={`${b.bed_number} · ${b.status}`}
                    className={`btn sm ${b.status === 'available' ? 'primary' : b.status === 'occupied' ? 'danger' : 'ghost'}`}
                    onClick={() => {
                      const next = b.status === 'available' ? 'cleaning' : b.status === 'cleaning' ? 'available' : b.status === 'maintenance' ? 'available' : 'maintenance';
                      act(b.id, 'bed', { status: next });
                    }}
                    disabled={Boolean(busyId) || b.status === 'reserved' || b.status === 'occupied'}
                  >
                    {b.bed_number}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="tiny muted">Tap a free/cleaning bed to toggle availability. Reserved and occupied beds can only change via the emergency workflow.</p>
        </div>
      </div>

      {selected ? (
        <div className="modal-backdrop" onMouseDown={(ev) => ev.target === ev.currentTarget && setSelected(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>{selected.id}</h3>
              <button className="btn ghost sm" onClick={() => setSelected(null)}>Close</button>
            </div>
            <div className="modal-body stack">
              <div className="row between">
                <Badge tone={urgencyTone[selected.urgency]}>{selected.urgency?.toUpperCase()}</Badge>
                <StatusBadge status={selected.status} />
              </div>
              <p className="small">{selected.summary}</p>
              <StatusTimeline timeline={selected.timeline} vertical />
              <dl className="kv">
                <dt>Department</dt><dd>{selected.required_department}</dd>
                <dt>Specialization</dt><dd>{selected.required_specialization}</dd>
                <dt>Ward / Bed</dt><dd>{selected.ward ? `${selected.ward.name} · ${selected.bed?.bed_number}` : '—'}</dd>
                <dt>Doctor</dt><dd>{selected.doctor?.name || '—'}</dd>
                <dt>Patient</dt><dd>{selected.patient?.name || 'Not registered yet'}</dd>
              </dl>
              <div>
                <b className="small">Preparation checklist</b>
                <ul className="small" style={{ paddingLeft: '1.1rem', color: 'var(--slate-600)' }}>
                  {(selected.recommended_actions || []).map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
