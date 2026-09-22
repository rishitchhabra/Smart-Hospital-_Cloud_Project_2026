import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Loading, StatusBadge, useToast, EmptyState, fmtTime, urgencyTone } from '../components/ui.jsx';
import { AdmissionModal, EditPatientModal, RegisterPatientModal, StaffAppointmentModal, PatientCredentialsModal } from '../components/PatientModals.jsx';
import Icon from '../components/Icon.jsx';

export default function ReceptionDashboard() {
  const { push } = useToast();
  const [emergencies, setEmergencies] = useState([]);
  const [patients, setPatients] = useState([]);
  const [beds, setBeds] = useState({ beds: [], inventory: [] });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [admitFor, setAdmitFor] = useState(null);
  const [editPatient, setEditPatient] = useState(null);
  const [opdOpen, setOpdOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [creds, setCreds] = useState(null);
  const [query, setQuery] = useState('');

  const showCredentials = async (patientId) => {
    try {
      const res = await api.get(`/patients/${patientId}/credentials`);
      setCreds(res);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const reissueCode = async () => {
    try {
      const res = await api.post(`/patients/${creds.patientId}/credentials/reissue`, {});
      setCreds(res);
      push('New access code issued', 'success');
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [e, p, b, a] = await Promise.all([
        api.get('/emergency'),
        api.get('/patients'),
        api.get('/beds'),
        api.get('/appointments').catch(() => ({ appointments: [] })),
      ]);
      setEmergencies(e.emergencies);
      setPatients(p.patients);
      setBeds(b);
      setAppointments(a.appointments);
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

  const pending = emergencies.filter((e) => !['ADMITTED', 'CANCELLED'].includes(e.status));
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const emg = emergencies.filter((e) => e.id.toLowerCase().includes(q) || (e.patient?.name || '').toLowerCase().includes(q));
    const pat = patients.filter((p) => p.id.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q));
    return { emg, pat };
  }, [query, emergencies, patients]);

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Reception</div>
          <h1>Front desk</h1>
          <p className="muted" style={{ margin: 0 }}>Registration, OPD appointments, admission details and bed availability.</p>
        </div>
        <div className="row gap-sm">
          <button className="btn ghost" onClick={() => setOpdOpen(true)}><Icon name="user" size={15} /> Register OPD patient</button>
          <button className="btn ghost" onClick={() => setBookOpen(true)}><Icon name="calendar" size={15} /> Book appointment</button>
          <Link className="btn primary" to="/emergency"><Icon name="activity" size={15} /> Emergency &amp; Appointments</Link>
        </div>
      </div>

      <div className="grid cols-4">
        <div className="stat danger"><div className="label">Pending emergencies</div><div className="value">{pending.length}</div><div className="sub">awaiting registration</div></div>
        <div className="stat accent"><div className="label">Available beds</div><div className="value">{beds.inventory.reduce((s, w) => s + w.available, 0)}</div><div className="sub">ready to allocate</div></div>
        <div className="stat ok"><div className="label">Registered patients</div><div className="value">{patients.length}</div></div>
        <div className="stat info"><div className="label">Appointments</div><div className="value">{appointments.length}</div></div>
      </div>

      <div className="card">
        <h3>Search Patient / Emergency ID</h3>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ID or name — e.g. PAT-123456, EMG-AB12CD, Ravi"
        />
        {searchResults ? (
          <div className="mt-2 stack">
            {searchResults.emg.map((e) => (
              <div key={e.id} className="row between card" style={{ boxShadow: 'none', background: 'var(--slate-50)' }}>
                <div>
                  <b>{e.id}</b> <span className="small muted">· {e.patient?.name || 'Unregistered'}</span>
                  <div className="tiny muted">{e.required_department} · {e.ward?.name || '—'} · {e.doctor?.name || '—'}</div>
                </div>
                <div className="row gap-sm">
                  <StatusBadge status={e.status} />
                  {e.status !== 'ADMITTED' && e.status !== 'CANCELLED' ? <button className="btn primary sm" onClick={() => setAdmitFor(e)}>Register &amp; admit</button> : null}
                </div>
              </div>
            ))}
            {searchResults.pat.map((p) => (
              <div key={p.id} className="row between card" style={{ boxShadow: 'none', background: 'var(--slate-50)' }}>
                <div>
                  <b>{p.id}</b> <span className="small muted">· {p.name}</span>
                  <div className="tiny muted">{p.admission?.ward_name} · {p.admission?.bed_number} · {p.admission?.doctor_name}</div>
                </div>
                <div className="row gap-sm">
                  <Badge tone={p.admission?.status === 'under_treatment' ? 'amber' : 'green'}>{p.admission?.status?.replace('_', ' ') || 'admitted'}</Badge>
                  <button className="btn ghost sm" onClick={() => showCredentials(p.id)}>Login details</button>
                  <button className="btn ghost sm" onClick={() => setEditPatient(p)}>Update details</button>
                </div>
              </div>
            ))}
            {searchResults.emg.length === 0 && searchResults.pat.length === 0 ? <p className="muted small">No matches.</p> : null}
          </div>
        ) : null}
      </div>

      {loading ? <Loading /> : null}

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <h2 style={{ margin: 0 }}>Emergency queue</h2>
          {!loading && pending.length === 0 ? (
            <div className="card"><EmptyState icon="clipboard" title="No pending emergencies" hint="Start an emergency intake to see it here." /></div>
          ) : pending.map((e) => (
            <div key={e.id} className="card">
              <div className="row between">
                <div>
                  <b>{e.id}</b>
                  <div className="tiny muted">{fmtTime(e.created_at)}</div>
                </div>
                <StatusBadge status={e.status} />
              </div>
              <div className="row wrap gap-sm mt-1">
                <Badge tone={urgencyTone[e.urgency]}>{String(e.urgency).toUpperCase()}</Badge>
                <Badge tone="teal">Level {e.triage_level}</Badge>
                <Badge tone="blue">{e.required_department}</Badge>
                {e.triage_confidence ? <Badge tone="gray">confidence {Math.round(e.triage_confidence * 100)}%</Badge> : null}
              </div>
              <div className="tiny muted mt-1">{e.summary}</div>
              <dl className="kv mt-1">
                <dt>Ward / Bed</dt><dd>{e.ward ? `${e.ward.name} · ${e.bed?.bed_number}` : 'Pending'}</dd>
                <dt>Doctor</dt><dd>{e.doctor?.name || 'Pending'}</dd>
              </dl>
              <DeptOverride emergency={e} onDone={() => load(true)} />
              <div className="row gap-sm mt-2">
                <button className="btn primary sm" onClick={() => setAdmitFor(e)}>Complete registration</button>
              </div>
            </div>
          ))}
        </div>

        <div className="stack">
          <h2 style={{ margin: 0 }}>Bed availability</h2>
          <div className="card">
            {beds.inventory.map((w) => (
              <div key={w.ward_id} className="row between" style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                <div>
                  <b className="small">{w.ward_name}</b>
                  <div className="tiny muted">{w.total} beds</div>
                </div>
                <div className="row gap-sm">
                  <Badge tone="green">{w.available} free</Badge>
                  <Badge tone="amber">{w.reserved} reserved</Badge>
                  <Badge tone="gray">{w.occupied} occupied</Badge>
                </div>
              </div>
            ))}
          </div>

          <h2 style={{ margin: 0 }}>Recent patients</h2>
          <div className="card" style={{ padding: 0 }}>
            {patients.length === 0 ? <EmptyState icon="users" title="No patients registered yet" /> : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table>
                  <thead><tr><th>Patient</th><th>Ward/Bed</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {patients.slice(0, 10).map((p) => (
                      <tr key={p.id}>
                        <td><b>{p.name}</b><div className="tiny muted">{p.id}</div></td>
                        <td>{p.admission?.ward_name || '—'} · {p.admission?.bed_number || '—'}</td>
                        <td><Badge tone={p.admission?.status === 'under_treatment' ? 'amber' : 'green'}>{p.admission?.status?.replace('_', ' ') || '—'}</Badge></td>
                        <td className="right">
                          <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn ghost sm" onClick={() => showCredentials(p.id)}>Login</button>
                            <button className="btn ghost sm" onClick={() => setEditPatient(p)}>Edit</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <h2 style={{ margin: 0 }}>Appointments</h2>
          <div className="card">
            {appointments.length === 0 ? <p className="muted small">No appointments scheduled.</p> : appointments.slice(0, 6).map((a) => (
              <div key={a.id} className="row between small" style={{ padding: '0.3rem 0' }}>
                <span>{a.patient_name} · {a.doctor_name}</span>
                <span className="muted">{fmtTime(a.scheduled_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {admitFor ? (
        <AdmissionModal
          emergency={admitFor}
          onClose={() => setAdmitFor(null)}
          onSaved={async (created) => {
            setAdmitFor(null);
            await load(true);
            if (created?.patientLogin) {
              push(`Patient ${created.patient.id} registered`, 'success');
              setCreds({ patientId: created.patient.id, name: created.patient.name, username: created.patientLogin.username, accessCode: created.patientLogin.password });
            }
          }}
        />
      ) : null}

      {editPatient ? (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={async () => { setEditPatient(null); await load(true); }}
        />
      ) : null}

      {opdOpen ? (
        <RegisterPatientModal
          onClose={() => setOpdOpen(false)}
          onSaved={async (res) => {
            setOpdOpen(false);
            await load(true);
            if (res?.patientLogin) {
              setCreds({ patientId: res.patient.id, name: res.patient.name, username: res.patientLogin.username, accessCode: res.patientLogin.portalCode });
            }
          }}
        />
      ) : null}

      {bookOpen ? (
        <StaffAppointmentModal
          onClose={() => setBookOpen(false)}
          onSaved={async () => { setBookOpen(false); await load(true); }}
        />
      ) : null}

      {creds ? (
        <PatientCredentialsModal
          creds={creds}
          onClose={() => setCreds(null)}
          onReissue={reissueCode}
        />
      ) : null}
    </div>
  );
}

function DeptOverride({ emergency, onDone }) {
  const { push } = useToast();
  const [departments, setDepartments] = useState([]);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(emergency.required_department);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/departments').then((d) => setDepartments(d.departments)).catch(() => {}); }, []);

  const apply = async () => {
    setBusy(true);
    try {
      await api.patch(`/emergency/${emergency.id}/triage`, { department: value });
      push(`Department corrected to ${value}`, 'success');
      setOpen(false);
      onDone();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <button className="btn ghost sm mt-1" onClick={() => setOpen(true)}>Correct department</button>;
  }
  return (
    <div className="row gap-sm mt-1">
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
      </select>
      <button className="btn primary sm" onClick={apply} disabled={busy || value === emergency.required_department}>Apply</button>
      <button className="btn ghost sm" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}
