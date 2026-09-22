import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Loading, Modal, StatusBadge, useToast, urgencyTone, fmtTime, EmptyState } from '../components/ui.jsx';
import StatusTimeline from '../components/StatusTimeline.jsx';
import { AdmissionModal, EditPatientModal } from '../components/PatientModals.jsx';
import Icon from '../components/Icon.jsx';

const FREQUENCIES = ['1-0-0', '0-0-1', '1-0-1', '1-1-1', '1-1-1-1', 'q6h', 'q8h', 'q12h', 'SOS', 'STAT'];
const FOOD = ['before food', 'after food', 'empty stomach', 'anytime'];
const ACTIVE_EMERGENCY = ['EMERGENCY_DETECTED', 'BED_RESERVED', 'DOCTOR_ASSIGNED', 'STAFF_ALERTED', 'PATIENT_ARRIVED'];

export default function DoctorDashboard() {
  const { user } = useAuth();
  const { push } = useToast();
  const [patients, setPatients] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [modal, setModal] = useState(null);
  const [admitFor, setAdmitFor] = useState(null);
  const [editPatient, setEditPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [myDoctor, setMyDoctor] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [dutyBusy, setDutyBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, e, m, a, docs] = await Promise.all([
        api.get('/patients'),
        api.get('/emergency'),
        api.get('/medicines'),
        api.get('/appointments').catch(() => ({ appointments: [] })),
        api.get('/doctors').catch(() => ({ doctors: [] })),
      ]);
      setPatients(p.patients);
      setEmergencies(e.emergencies);
      setMedicines(m.medicines);
      setAppointments(a.appointments || []);
      const mine = (docs.doctors || []).find((d) => d.id === user?.doctorId);
      setMyDoctor(mine || null);
      if (mine) {
        const sc = await api.get(`/doctors/${mine.id}/schedule`).catch(() => ({ schedule: [] }));
        setSchedule(sc.schedule || []);
      }
      setSelectedId((cur) => cur || p.patients[0]?.id || null);
    } catch (err) {
      if (!silent) push(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push, user?.doctorId]);

  const toggleDuty = async () => {
    setDutyBusy(true);
    try {
      const onDuty = myDoctor?.availability !== 'available';
      const res = await api.patch('/doctors/me/duty', { onDuty });
      setMyDoctor((d) => ({ ...d, availability: res.doctor.availability }));
      push(onDuty ? 'You are now ON duty — you can receive emergencies' : 'You are now OFF duty', onDuty ? 'success' : 'info');
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setDutyBusy(false);
    }
  };

  const startTreatment = async (eid) => {
    try {
      const res = await api.post(`/emergency/${eid}/start-treatment`, {});
      push(`Treatment started · ${res.patient.id}`, 'success');
      await load(true);
      setSelectedId(res.patient.id);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const completeAppointment = async (apt) => {
    try {
      await api.patch(`/appointments/${apt.id}/status`, { status: 'completed' });
      push('Appointment completed', 'success');
      await load(true);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [load]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const data = await api.get(`/patients/${id}`);
      setDetail(data.patient);
    } catch (err) {
      push(err.message, 'error');
    }
  }, [push]);

  useEffect(() => { loadDetail(selectedId); }, [selectedId, loadDetail]);

  const updateStatus = async (status) => {
    const admission = detail?.admission;
    if (!admission) return;
    try {
      await api.patch(`/admissions/${admission.id}/status`, { status });
      push(`Treatment status: ${status.replace('_', ' ')}`, 'success');
      await loadDetail(selectedId);
      await load(true);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const assigned = patients.length;
  const underTreatment = patients.filter((p) => p.admission?.status === 'under_treatment').length;
  const criticalActive = emergencies.filter((e) => !['ADMITTED', 'CANCELLED'].includes(e.status) && e.urgency === 'critical').length;
  const activeEmergencies = emergencies.filter((e) => ACTIVE_EMERGENCY.includes(e.status));

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Doctor · {user.name}</div>
          <h1>My patients</h1>
          <p className="muted" style={{ margin: 0 }}>Only patients and emergencies assigned to you are shown.</p>
        </div>
        <div className="row gap-sm">
          <div className={`duty ${myDoctor?.availability === 'available' ? 'on' : ''}`} title="Doctors receive emergency assignments only when on duty">
            <Icon name="power" size={15} />
            <span className="small" style={{ fontWeight: 700 }}>
              {myDoctor?.availability === 'available' ? 'On duty' : myDoctor?.availability === 'busy' ? 'Busy' : 'Off duty'}
            </span>
          </div>
          <button className="btn ghost" onClick={() => load()}><Icon name="refresh" size={15} /></button>
        </div>
      </div>

      {myDoctor && myDoctor.availability !== 'available' ? (
        <div className="card" style={{ borderLeft: '4px solid var(--amber-500)', background: 'var(--amber-50)' }}>
          <div className="row between">
            <span className="small"><b>You are {myDoctor.availability === 'busy' ? 'busy' : 'off duty'}.</b> New emergencies are not assigned to you.</span>
            <button className="btn primary sm" onClick={toggleDuty} disabled={dutyBusy}>{dutyBusy ? 'Saving…' : 'Go on duty'}</button>
          </div>
        </div>
      ) : myDoctor ? (
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost sm" onClick={toggleDuty} disabled={dutyBusy}>{dutyBusy ? 'Saving…' : 'Go off duty'}</button>
        </div>
      ) : null}

      <div className="grid cols-4">
        <div className="stat accent"><div className="label">Assigned patients</div><div className="value">{assigned}</div></div>
        <div className="stat warn"><div className="label">Under treatment</div><div className="value">{underTreatment}</div></div>
        <div className="stat danger"><div className="label">Critical active</div><div className="value">{criticalActive}</div></div>
        <div className="stat info"><div className="label">My emergencies</div><div className="value">{emergencies.length}</div></div>
      </div>

      {loading ? <Loading /> : null}

      {!loading ? (
        <div className="grid" style={{ gridTemplateColumns: '340px 1fr', alignItems: 'start' }}>
          <div className="stack">
            {activeEmergencies.length ? (
              <>
                <h2 style={{ margin: 0 }}>Assigned emergencies</h2>
                {activeEmergencies.map((e) => (
                  <div key={e.id} className="card" style={{ borderLeft: `5px solid ${e.urgency === 'critical' ? 'var(--red-500)' : 'var(--amber-500)'}` }}>
                    <div className="row between">
                      <b>{e.id}</b>
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="tiny muted mt-1">{e.summary}</div>
                    <div className="small muted mt-1">
                      {e.ward ? `${e.ward.name} · ${e.bed?.bed_number}` : 'Bed pending'}
                    </div>
                    <div className="row wrap gap-sm mt-2">
                      <button className="btn primary sm" onClick={() => startTreatment(e.id)}>
                        <Icon name="stethoscope" size={14} /> Start treatment
                      </button>
                      <button className="btn ghost sm" onClick={() => setAdmitFor(e)}>Add full details</button>
                      {e.timestamps?.BED_PREPARED ? <Badge tone="green">bed ready</Badge> : null}
                      {e.timestamps?.PATIENT_ARRIVED ? <Badge tone="teal">arrived</Badge> : null}
                    </div>
                  </div>
                ))}
                <div className="divider" />
              </>
            ) : null}

            <h2 style={{ margin: 0 }}>Assigned patients</h2>
            {patients.length === 0 ? (
              <div className="card"><EmptyState icon="stethoscope" title="No patients assigned" hint="Patients appear here after emergency assignment, admission, or an OPD appointment booked with you." /></div>
            ) : patients.map((p) => {
              const isOpd = !p.admission;
              return (
              <button
                key={p.id}
                className="card hover"
                onClick={() => setSelectedId(p.id)}
                style={{
                  textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  borderColor: p.id === selectedId ? 'var(--teal-500)' : undefined,
                  boxShadow: p.id === selectedId ? '0 0 0 2px var(--teal-100)' : undefined,
                }}
              >
                <div className="row between">
                  <b>{p.name}</b>
                  {isOpd ? (
                    <Badge tone="blue">OPD</Badge>
                  ) : (
                    <Badge tone={p.admission?.status === 'under_treatment' ? 'amber' : 'green'}>
                      {p.admission?.status?.replace('_', ' ') || 'admitted'}
                    </Badge>
                  )}
                </div>
                <div className="small muted">{p.id} · {p.age || '—'}y {p.gender || ''}</div>
                <div className="tiny muted mt-1">
                  {isOpd ? (p.contact || 'Outpatient') : `${p.admission?.ward_name || ''} · ${p.admission?.bed_number || ''}`}
                </div>
              </button>
              );
            })}
          </div>

          <div className="stack">
            {!detail ? (
              <div className="card"><EmptyState icon="clipboard" title="Select a patient" /></div>
            ) : (
              <>
                <div className="card">
                  <div className="row between">
                    <div>
                      <h2 style={{ margin: 0 }}>{detail.name}</h2>
                      <div className="small muted">{detail.id} · {detail.age || '—'} years · {detail.gender || '—'} · {detail.blood_group || 'blood group n/a'}</div>
                    </div>
                    <div className="row gap-sm">
                      <button className="btn primary sm" onClick={() => setModal('prescription')}>+ Prescription</button>
                      <button className="btn ghost sm" onClick={() => setModal('note')}>+ Clinical note</button>
                      <button className="btn ghost sm" onClick={() => setEditPatient(detail)}>Edit details</button>
                    </div>
                  </div>
                  <div className="grid cols-3 mt-2">
                    {detail.admission ? (
                      <>
                        <div><div className="tiny muted">WARD / BED</div><b>{detail.admission.ward_name || '—'} · {detail.admission.bed_number || '—'}</b></div>
                        <div><div className="tiny muted">ADMITTED</div><b>{fmtTime(detail.admission.admitted_at)}</b></div>
                        <div>
                          <div className="tiny muted">TREATMENT STATUS</div>
                          <select
                            value={detail.admission.status || 'admitted'}
                            onChange={(ev) => updateStatus(ev.target.value)}
                          >
                            <option value="admitted">Admitted</option>
                            <option value="under_treatment">Under treatment</option>
                            <option value="discharged">Discharge</option>
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div><div className="tiny muted">TYPE</div><Badge tone="blue">OPD / Outpatient</Badge></div>
                        <div><div className="tiny muted">CONTACT</div><b>{detail.contact || '—'}</b></div>
                        <div><div className="tiny muted">REGISTERED</div><b>{fmtTime(detail.created_at)}</b></div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid cols-2">
                  <div className="card">
                    <h3>Emergency summary</h3>
                    {detail.emergency ? (
                      <>
                        <div className="row gap-sm mb-1">
                          <Badge tone={urgencyTone[detail.emergency.urgency]}>{detail.emergency.urgency?.toUpperCase()}</Badge>
                          <Badge tone="teal">{detail.emergency.requiredDepartment}</Badge>
                        </div>
                        <p className="small">{detail.emergency.summary}</p>
                        <StatusTimeline timeline={buildTimeline(detail.emergency.timestamps)} vertical />
                      </>
                    ) : <p className="muted small">No linked emergency.</p>}
                  </div>

                  <div className="card">
                    <h3>Medical information</h3>
                    <dl className="kv">
                      <dt>Contact</dt><dd>{detail.contact || '—'}</dd>
                      <dt>Attendant</dt><dd>{detail.attendant_name || '—'} {detail.attendant_contact ? `· ${detail.attendant_contact}` : ''}</dd>
                      <dt>Allergies</dt><dd>{detail.allergies || 'None recorded'}</dd>
                      <dt>History</dt><dd>{detail.medical_history || '—'}</dd>
                      <dt>Emergency details</dt><dd>{detail.emergency_details || '—'}</dd>
                    </dl>
                  </div>
                </div>

                <div className="card">
                  <div className="card-title"><h3>Prescriptions &amp; treatment</h3><Badge tone="gray">{detail.prescriptions?.length || 0}</Badge></div>
                  {!detail.prescriptions?.length ? (
                    <EmptyState icon="pill" title="No prescriptions yet" hint="Add a prescription to start treatment." />
                  ) : detail.prescriptions.map((rx) => (
                    <div key={rx.id} className="card mb-2" style={{ boxShadow: 'none', background: 'var(--slate-50)' }}>
                      <div className="row between">
                        <b>{rx.status === 'note' ? 'Clinical note' : (rx.diagnosis || 'Prescription')}</b>
                        <span className="tiny muted">{fmtTime(rx.created_at)}</span>
                      </div>
                      {rx.clinical_notes ? <p className="small mt-1">{rx.clinical_notes}</p> : null}
                      {rx.items?.length ? (
                        <div className="table-wrap mt-1">
                          <table>
                            <thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Food</th></tr></thead>
                            <tbody>
                              {rx.items.map((it) => (
                                <tr key={it.id}>
                                  <td><b>{it.medicine_name}</b>{it.instructions ? <div className="tiny muted">{it.instructions}</div> : null}</td>
                                  <td>{it.dosage}</td>
                                  <td>{it.frequency}</td>
                                  <td>{it.duration}</td>
                                  <td>{it.before_after_food || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="grid cols-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-title"><h3 className="section-title"><Icon name="calendar" size={17} /> My appointments</h3><Badge tone="gray">{appointments.filter((a) => a.status === 'scheduled').length} upcoming</Badge></div>
            {appointments.length === 0 ? (
              <EmptyState icon="calendar" title="No appointments" hint="OPD appointments booked for you appear here." />
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table>
                  <thead><tr><th>When</th><th>Patient</th><th>Shift</th><th>Reason</th><th></th></tr></thead>
                  <tbody>
                    {appointments.map((a) => (
                      <tr key={a.id}>
                        <td className="small">{a.scheduled_at ? new Date(a.scheduled_at).toLocaleDateString() : '—'}</td>
                        <td>{a.patient_name}<div className="tiny muted">{a.patient_contact || ''}</div></td>
                        <td style={{ textTransform: 'capitalize' }}>{a.shift || '—'}</td>
                        <td className="small">{a.reason || '—'}</td>
                        <td className="right">
                          <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn ghost sm" onClick={() => setSelectedId(a.patient_id)}>Open</button>
                            {a.status === 'scheduled' ? <button className="btn ghost sm" onClick={() => completeAppointment(a)}>Complete</button> : <Badge tone={a.status === 'completed' ? 'green' : 'gray'}>{a.status}</Badge>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="section-title"><Icon name="clock" size={17} /> My OPD schedule</h3>
            {schedule.length === 0 ? (
              <p className="muted small">No schedule configured. Contact admin.</p>
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
                <table>
                  <thead><tr><th>Day</th><th>Shift</th><th>Max patients</th></tr></thead>
                  <tbody>
                    {schedule.map((s) => (
                      <tr key={s.id}>
                        <td style={{ textTransform: 'capitalize' }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.day_of_week]}</td>
                        <td style={{ textTransform: 'capitalize' }}>{s.shift}</td>
                        <td>{s.max_patients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {modal === 'prescription' && detail ? (
        <PrescriptionModal
          patient={detail}
          medicines={medicines}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await loadDetail(selectedId); await load(true); }}
        />
      ) : null}

      {modal === 'note' && detail ? (
        <NoteModal
          patient={detail}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await loadDetail(selectedId); }}
        />
      ) : null}

      {admitFor ? (
        <AdmissionModal
          emergency={admitFor}
          onClose={() => setAdmitFor(null)}
          onSaved={async () => {
            setAdmitFor(null);
            await load(true);
            if (selectedId) await loadDetail(selectedId);
          }}
        />
      ) : null}

      {editPatient ? (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={async () => { setEditPatient(null); await load(true); await loadDetail(selectedId); }}
        />
      ) : null}
    </div>
  );
}

function buildTimeline(ts = {}) {
  const order = ['EMERGENCY_DETECTED', 'BED_RESERVED', 'DOCTOR_ASSIGNED', 'STAFF_ALERTED', 'PATIENT_ARRIVED', 'ADMITTED'];
  const labels = {
    EMERGENCY_DETECTED: 'Emergency Detected', BED_RESERVED: 'Bed Reserved', DOCTOR_ASSIGNED: 'Doctor Assigned',
    STAFF_ALERTED: 'Staff Alerted', PATIENT_ARRIVED: 'Patient Arrived', ADMITTED: 'Admitted',
  };
  return order.map((k) => ({ key: k, label: labels[k], done: Boolean(ts[k]), at: ts[k] || null }));
}

function PrescriptionModal({ patient, medicines, onClose, onSaved }) {
  const { push } = useToast();
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ medicineName: '', dosage: '', frequency: '1-0-1', duration: '5 days', beforeAfterFood: 'after food', instructions: '' }]);
  const [busy, setBusy] = useState(false);

  const setItem = (i, key, value) => setItems((list) => list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  const addItem = () => setItems((l) => [...l, { medicineName: '', dosage: '', frequency: '1-0-1', duration: '5 days', beforeAfterFood: 'after food', instructions: '' }]);
  const removeItem = (i) => setItems((l) => l.filter((_, idx) => idx !== i));

  const save = async () => {
    const cleaned = items.filter((it) => it.medicineName.trim() && it.dosage.trim() && it.frequency.trim() && it.duration.trim());
    if (!cleaned.length) { push('Add at least one complete medicine', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/prescriptions', {
        patientId: patient.id,
        admissionId: patient.admission?.id,
        diagnosis,
        clinicalNotes: notes,
        items: cleaned,
      });
      push('Prescription saved', 'success');
      await onSaved();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`New prescription · ${patient.name}`}
      onClose={onClose}
      wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save prescription'}</button></>}
    >
      <div className="stack">
        <div className="form-grid">
          <div className="field"><label>Diagnosis</label><input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Acute coronary syndrome" /></div>
          <div className="field"><label>Clinical notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions, observations…" /></div>
        </div>
        <div className="divider" />
        <div className="row between"><b>Medicines</b><button className="btn ghost sm" onClick={addItem}>+ Add medicine</button></div>
        {items.map((it, i) => (
          <div key={i} className="card" style={{ boxShadow: 'none', background: 'var(--slate-50)' }}>
            <div className="form-grid">
              <div className="field">
                <label>Medicine</label>
                <input list="medicine-catalog" value={it.medicineName} onChange={(e) => setItem(i, 'medicineName', e.target.value)} placeholder="Start typing…" />
              </div>
              <div className="field"><label>Dosage</label><input value={it.dosage} onChange={(e) => setItem(i, 'dosage', e.target.value)} placeholder="e.g. 500 mg" /></div>
              <div className="field">
                <label>Frequency</label>
                <input list="frequency-options" value={it.frequency} onChange={(e) => setItem(i, 'frequency', e.target.value)} placeholder="1-0-1" />
              </div>
              <div className="field"><label>Duration</label><input value={it.duration} onChange={(e) => setItem(i, 'duration', e.target.value)} placeholder="5 days" /></div>
              <div className="field">
                <label>Before / after food</label>
                <select value={it.beforeAfterFood} onChange={(e) => setItem(i, 'beforeAfterFood', e.target.value)}>
                  {FOOD.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="field"><label>Instructions</label><input value={it.instructions} onChange={(e) => setItem(i, 'instructions', e.target.value)} placeholder="optional" /></div>
            </div>
            {items.length > 1 ? <button className="btn ghost sm mt-1" onClick={() => removeItem(i)}>Remove</button> : null}
          </div>
        ))}
      </div>

      <datalist id="medicine-catalog">
        {medicines.map((m) => <option key={m.id} value={m.name}>{m.form} · {m.strength}</option>)}
      </datalist>
      <datalist id="frequency-options">
        {FREQUENCIES.map((f) => <option key={f} value={f} />)}
      </datalist>
    </Modal>
  );
}

function NoteModal({ patient, onClose, onSaved }) {
  const { push } = useToast();
  const [note, setNote] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!note.trim()) { push('Write a note first', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/clinical-notes', { patientId: patient.id, note, diagnosis });
      push('Clinical note added', 'success');
      await onSaved();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Clinical note · ${patient.name}`}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add note'}</button></>}
    >
      <div className="stack">
        <div className="field"><label>Diagnosis / impression</label><input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></div>
        <div className="field"><label>Note</label><textarea rows={6} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observations, plan, review…" /></div>
      </div>
    </Modal>
  );
}
