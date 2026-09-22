import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Badge, Loading, useToast, EmptyState, fmtTime } from '../components/ui.jsx';

export default function ReceptionPatients() {
  const { push } = useToast();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/patients');
      setPatients(data.patients);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) =>
      p.id.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) ||
      (p.contact || '').includes(q) || (p.emergency_id || '').toLowerCase().includes(q)
    );
  }, [patients, query]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Reception</div>
          <h1>Patient records</h1>
        </div>
      </div>

      <div className="card">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by patient ID, emergency ID, name or contact" />
      </div>

      {loading ? <Loading /> : !filtered.length ? (
        <div className="card"><EmptyState icon="users" title="No patient records" hint="Patients are created only through the emergency workflow." /></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Patient</th><th>Contact</th><th>Emergency</th><th>Ward / Bed</th><th>Doctor</th><th>Admitted</th><th>Status</th></tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="tiny muted">{p.id} · {p.age || '—'}y {p.gender || ''}</div></td>
                  <td>{p.contact || '—'}<div className="tiny muted">{p.attendant_name || ''}</div></td>
                  <td>{p.emergency_id || '—'}</td>
                  <td>{p.admission?.ward_name || '—'} · {p.admission?.bed_number || '—'}</td>
                  <td>{p.admission?.doctor_name || '—'}</td>
                  <td className="small">{fmtTime(p.admission?.admitted_at)}</td>
                  <td><Badge tone={p.admission?.status === 'under_treatment' ? 'amber' : p.admission?.status === 'discharged' ? 'gray' : 'green'}>{p.admission?.status?.replace('_', ' ') || '—'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
