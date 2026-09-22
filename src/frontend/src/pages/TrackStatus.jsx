import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Loading, StatusBadge, useToast, urgencyTone, EmptyState, fmtTime } from '../components/ui.jsx';
import StatusTimeline from '../components/StatusTimeline.jsx';
import Icon from '../components/Icon.jsx';

export default function TrackStatus() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { push } = useToast();

  const saved = (() => { try { return JSON.parse(localStorage.getItem('medagentx_last_emergency') || 'null'); } catch { return null; } })();

  const [emergencyId, setEmergencyId] = useState(location.state?.emergencyId || saved?.emergencyId || '');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState('emergencies');
  const [emergencies, setEmergencies] = useState([]);
  const [patients, setPatients] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const lookup = useCallback(async (id) => {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.get(`/emergency/public/${encodeURIComponent(id)}`, { auth: false });
      setData(res);
      setSelected(null);
    } catch (err) {
      setError(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }, [push]);

  const loadLists = useCallback(async () => {
    setListLoading(true);
    try {
      const [e, p] = await Promise.all([
        api.get('/emergency'),
        api.get('/patients').catch(() => ({ patients: [] })),
      ]);
      setEmergencies(e.emergencies);
      setPatients(p.patients);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setListLoading(false);
    }
  }, [push]);

  useEffect(() => {
    if (isAuthenticated) loadLists();
    else if (emergencyId) lookup(emergencyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const openPatient = async (p) => {
    try {
      const res = await api.get(`/patients/${p.id}`);
      setSelected({ type: 'patient', data: res.patient });
    } catch (err) {
      push(err.message, 'error');
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Tracking</div>
          <h1 className="section-title"><Icon name="search" size={22} /> Track status</h1>
          <p className="muted" style={{ margin: 0 }}>
            {isAuthenticated
              ? user?.role === 'doctor' ? 'Patients and emergencies assigned to you.' : 'All patients and emergencies — click a row for details.'
              : 'Look up any emergency by its Emergency ID.'}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="row gap-sm">
          <input
            value={emergencyId}
            onChange={(e) => setEmergencyId(e.target.value)}
            placeholder="Emergency ID (e.g. EMG-AB12CD)"
            onKeyDown={(e) => e.key === 'Enter' && lookup(emergencyId.trim())}
          />
          <button className="btn primary" onClick={() => lookup(emergencyId.trim())} disabled={busy || !emergencyId.trim()}>
            {busy ? 'Checking…' : 'Track'}
          </button>
        </div>
        {error ? <p className="small mt-1" style={{ color: 'var(--red-600)' }}>{error}</p> : null}
      </div>

      {isAuthenticated ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="row gap-sm" style={{ padding: '0.7rem 0.8rem', borderBottom: '1px solid var(--slate-200)' }}>
            <button className={`btn sm ${tab === 'emergencies' ? 'primary' : 'ghost'}`} onClick={() => setTab('emergencies')}>Emergencies ({emergencies.length})</button>
            <button className={`btn sm ${tab === 'patients' ? 'primary' : 'ghost'}`} onClick={() => setTab('patients')}>Patients ({patients.length})</button>
          </div>
          {listLoading ? <Loading /> : (
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {tab === 'emergencies' ? (
                emergencies.length === 0 ? <EmptyState icon="activity" title="No emergencies" /> :
                emergencies.map((e) => (
                  <button key={e.id} className="list-row" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--slate-100)' }} onClick={() => lookup(e.id)}>
                    <div className="grow">
                      <div className="row between">
                        <b>{e.id}</b>
                        <StatusBadge status={e.status} />
                      </div>
                      <div className="tiny muted">{e.required_department} · {e.ward?.name || '—'} · {e.doctor?.name || 'unassigned'}</div>
                    </div>
                    <Icon name="chevron-right" size={16} />
                  </button>
                ))
              ) : (
                patients.length === 0 ? <EmptyState icon="users" title="No patient records" /> :
                patients.map((p) => (
                  <button key={p.id} className="list-row" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--slate-100)' }} onClick={() => openPatient(p)}>
                    <div className="grow">
                      <div className="row between">
                        <b>{p.name}</b>
                        <Badge tone={p.patient_type === 'opd' ? 'blue' : p.admission?.status === 'under_treatment' ? 'amber' : 'green'}>
                          {p.patient_type === 'opd' ? 'OPD' : (p.admission?.status?.replace('_', ' ') || 'admitted')}
                        </Badge>
                      </div>
                      <div className="tiny muted">{p.id} · {p.admission?.ward_name ? `${p.admission.ward_name} · ${p.admission.bed_number}` : (p.contact || '—')}</div>
                    </div>
                    <Icon name="chevron-right" size={16} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : null}

      {selected?.type === 'patient' ? <PatientDetail patient={selected.data} onClose={() => setSelected(null)} /> : null}

      {data ? (
        <div className="card">
          <div className="row between">
            <div>
              <div className="tiny muted">EMERGENCY</div>
              <h2 style={{ margin: 0 }}>{data.emergencyId}</h2>
            </div>
            <Badge tone={urgencyTone[data.urgency]}>{String(data.urgency).toUpperCase()}</Badge>
          </div>

          <StatusTimeline timeline={data.timeline} />

          <div className="divider" />
          <div className="grid cols-3">
            <div><div className="tiny muted">STATUS</div><b>{data.statusLabel}</b></div>
            <div><div className="tiny muted">WARD / BED</div><b>{data.ward ? `${data.ward.name} · ${data.bed?.bed_number || '—'}` : 'Pending'}</b></div>
            <div><div className="tiny muted">DOCTOR</div><b>{data.doctor?.name || 'Pending'}</b></div>
          </div>

          <div className="divider" />
          <div className="row gap-sm">
            <Badge tone="blue">{data.requiredDepartment}</Badge>
            <Badge tone="gray">Level {data.triageLevel}</Badge>
            {data.triageConfidence ? <Badge tone="gray">confidence {Math.round(data.triageConfidence * 100)}%</Badge> : null}
          </div>
          <p className="small mt-1">{data.summary}</p>

          {data.recommendedActions?.length ? (
            <>
              <div className="divider" />
              <b className="small">Preparation</b>
              <ul className="small" style={{ paddingLeft: '1.1rem', margin: '0.4rem 0 0', color: 'var(--slate-600)' }}>
                {data.recommendedActions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </>
          ) : null}

          {data.patientId ? <div className="badge green mt-2" style={{ width: 'fit-content' }}>Admitted as {data.patientId}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function PatientDetail({ patient, onClose }) {
  const admission = patient.admission;
  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{patient.name}</h2>
        <button className="btn ghost sm" onClick={onClose}>Close</button>
      </div>
      <div className="grid cols-3 mt-1">
        <div><div className="tiny muted">PATIENT ID</div><b>{patient.id}</b></div>
        <div><div className="tiny muted">TYPE</div><b style={{ textTransform: 'capitalize' }}>{patient.patient_type || 'opd'}</b></div>
        <div><div className="tiny muted">STATUS</div><b style={{ textTransform: 'capitalize' }}>{admission?.status?.replace('_', ' ') || 'Outpatient'}</b></div>
        <div><div className="tiny muted">WARD / BED</div><b>{admission ? `${admission.ward_name} · ${admission.bed_number}` : '—'}</b></div>
        <div><div className="tiny muted">DOCTOR</div><b>{admission?.doctor_name || '—'}</b></div>
        <div><div className="tiny muted">CONTACT</div><b>{patient.contact || '—'}</b></div>
        <div><div className="tiny muted">AGE / GENDER</div><b>{patient.age || '—'} / {patient.gender || '—'}</b></div>
        <div><div className="tiny muted">BLOOD GROUP</div><b>{patient.blood_group || '—'}</b></div>
        <div><div className="tiny muted">ADMITTED</div><b>{admission ? fmtTime(admission.admitted_at) : '—'}</b></div>
      </div>
      {patient.prescriptions?.length ? (
        <>
          <div className="divider" />
          <h3>Prescriptions</h3>
          {patient.prescriptions.map((rx) => (
            <div key={rx.id} className="mb-1">
              <b className="small">{rx.diagnosis || 'Prescription'}</b>
              <div className="small muted">{(rx.items || []).map((it) => `${it.medicine_name} · ${it.dosage} · ${it.frequency}`).join(' | ')}</div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
