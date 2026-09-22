import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Loading, StatusBadge, useToast, EmptyState, fmtTime } from '../components/ui.jsx';

export default function AdminDashboard() {
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/admin/overview');
      setData(res);
    } catch (err) {
      if (!silent) push(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <Loading label="Loading operations overview…" />;
  if (!data) return <div className="card">Unable to load overview.</div>;

  const { totals, bedInventory, emergencyByStatus, emergenciesByDepartment, recentAlerts, recentEmergencies, recentActivity, agents } = data;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Administrator</div>
          <h1>Operations overview</h1>
          <p className="muted" style={{ margin: 0 }}>Live hospital state and multi-agent health.</p>
        </div>
        <button className="btn ghost" onClick={() => load()}>Refresh</button>
      </div>

      <div className="grid cols-4">
        <div className="stat accent"><div className="label">Total patients</div><div className="value">{totals.patients}</div><div className="sub">created via emergency workflow</div></div>
        <div className="stat danger"><div className="label">Emergency cases</div><div className="value">{totals.emergencies}</div><div className="sub">{totals.pendingEmergencies} pending · {totals.criticalEmergencies} critical</div></div>
        <div className="stat ok"><div className="label">Available beds</div><div className="value">{totals.availableBeds}</div><div className="sub">of {totals.totalBeds} total</div></div>
        <div className="stat warn"><div className="label">Occupied beds</div><div className="value">{totals.occupiedBeds}</div><div className="sub">{totals.reservedBeds} reserved</div></div>
        <div className="stat info"><div className="label">Active admissions</div><div className="value">{totals.activeAdmissions}</div></div>
        <div className="stat accent"><div className="label">Available doctors</div><div className="value">{totals.availableDoctors}</div><div className="sub">of {totals.totalDoctors} doctors</div></div>
        <div className="stat info"><div className="label">On-duty staff</div><div className="value">{totals.onDutyStaff}</div><div className="sub">of {totals.totalStaff} staff</div></div>
        <div className="stat ok"><div className="label">Prescriptions</div><div className="value">{totals.prescriptions}</div><div className="sub">{totals.users} active users</div></div>
        <div className="stat info"><div className="label">OPD patients</div><div className="value">{totals.opdPatients}</div><div className="sub">{totals.appointments} scheduled appointments</div></div>
        <div className="stat warn"><div className="label">Pharmacy queue</div><div className="value">{totals.pendingPharmacy}</div><div className="sub">pending / preparing</div></div>
        <div className="stat accent"><div className="label">On-duty doctors</div><div className="value">{totals.onDutyDoctors}</div><div className="sub">available for assignment</div></div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Bed inventory by ward</h3>
          {bedInventory.map((w) => {
            const pct = w.total ? Math.round((w.occupied / w.total) * 100) : 0;
            return (
              <div key={w.ward_name} className="mb-2">
                <div className="row between small">
                  <b>{w.ward_name}</b>
                  <span className="muted">{w.available} free · {w.reserved} reserved · {w.occupied} occupied</span>
                </div>
                <div style={{ height: 8, background: 'var(--slate-200)', borderRadius: 999, marginTop: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? 'var(--red-500)' : pct > 50 ? 'var(--amber-500)' : 'var(--teal-500)' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card">
          <h3>Multi-agent system health</h3>
          <div className="stack">
            {agents.map((a) => (
              <div key={a.name} className="row between">
                <div>
                  <b className="small">{a.name}</b>
                  <div className="tiny muted">{a.role}</div>
                </div>
                <Badge tone={a.status === 'online' ? 'green' : 'amber'} dot>{a.status}</Badge>
              </div>
            ))}
          </div>
          <div className="divider" />
          <h3>Emergencies by department</h3>
          {emergenciesByDepartment.length === 0 ? <p className="muted small">No emergencies recorded.</p> : emergenciesByDepartment.map((d) => (
            <div key={d.department} className="row between small" style={{ padding: '0.25rem 0' }}>
              <span>{d.department || 'Unassigned'}</span><Badge tone="gray">{d.count}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="grid cols-3" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>Emergency pipeline</h3>
          {emergencyByStatus.length === 0 ? <p className="muted small">No data.</p> : emergencyByStatus.map((s) => (
            <div key={s.status} className="row between" style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--slate-100)' }}>
              <StatusBadge status={s.status} />
              <b>{s.count}</b>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Recent alerts</h3>
          {recentAlerts.length === 0 ? <p className="muted small">No alerts yet.</p> : recentAlerts.slice(0, 6).map((a) => (
            <div key={a.id} className="mb-2">
              <div className="row between">
                <b className="small">{a.title}</b>
                <span className="tiny muted">{fmtTime(a.created_at)}</span>
              </div>
              <div className="tiny muted" style={{ whiteSpace: 'pre-wrap' }}>{a.message.split('\n')[0]}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>System activity</h3>
          {recentActivity.length === 0 ? <EmptyState icon="file-text" title="No activity yet" /> : recentActivity.slice(0, 8).map((l) => (
            <div key={l.id} className="mb-1">
              <div className="row between">
                <span className="small"><b>{l.action}</b></span>
                <span className="tiny muted">{fmtTime(l.created_at)}</span>
              </div>
              <div className="tiny muted">{l.actor_role || 'system'} · {l.entity || ''} {l.entity_id || ''}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Recent emergencies</h3>
        {recentEmergencies.length === 0 ? <p className="muted small">No emergencies recorded yet.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Emergency</th><th>Department</th><th>Urgency</th><th>Patient</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {recentEmergencies.map((e) => (
                  <tr key={e.id}>
                    <td><b>{e.id}</b></td>
                    <td>{e.required_department}</td>
                    <td><Badge tone={e.urgency === 'critical' ? 'red' : e.urgency === 'high' ? 'amber' : 'blue'}>{e.urgency}</Badge></td>
                    <td>{e.patient_id || '—'}</td>
                    <td><StatusBadge status={e.status} /></td>
                    <td className="small">{fmtTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
