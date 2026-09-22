import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Badge, Modal, StatusBadge, useToast, urgencyTone } from '../components/ui.jsx';
import { RegisterPatientModal } from '../components/PatientModals.jsx';
import StatusTimeline from '../components/StatusTimeline.jsx';
import Icon from '../components/Icon.jsx';

const QUICK = [
  'Severe chest pain, sweating, pain spreading to left arm',
  'Sudden weakness on one side of face and slurred speech',
  'Child with high fever and continuous vomiting',
  'Deep cut on leg from a fall, bleeding a lot',
  'Difficulty breathing and wheezing',
  'Severe stomach pain since this morning',
];

const GREETING = {
  role: 'assistant',
  content:
    "Emergency intake. Describe what's happening in your own words. I only need a couple of details to start emergency coordination — the patient's full details can be completed later.",
};

export default function EmergencyIntake() {
  const { user } = useAuth();
  const [mode, setMode] = useState('emergency');

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Reception Desk</div>
          <h1>{mode === 'emergency' ? 'Emergency intake assistant' : 'Appointment assistant'}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {user?.name ? `${user.name} — ` : ''}
            {mode === 'emergency'
              ? 'start emergency coordination immediately; registration can follow at admission.'
              : 'register a patient and book an OPD appointment with shift capacity checks.'}
          </p>
        </div>
        <div className="mode-tabs">
          <button className={`mode-tab emergency ${mode === 'emergency' ? 'active emergency' : ''}`} onClick={() => setMode('emergency')}>
            <Icon name="alert-octagon" size={15} /> Emergency
          </button>
          <button className={`mode-tab ${mode === 'appointment' ? 'active' : ''}`} onClick={() => setMode('appointment')}>
            <Icon name="calendar" size={15} /> Appointments
          </button>
        </div>
      </div>

      {mode === 'emergency' ? <EmergencyChat /> : <AppointmentAssistant />}
    </div>
  );
}

/* ============================ Emergency mode ============================= */

function EmergencyChat() {
  const { push } = useToast();
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const conversation = useMemo(
    () => messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy || result) return;
    setInput('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setBusy(true);
    try {
      const data = await api.post('/emergency/chat', {
        conversation: next.map((m) => ({ role: m.role, content: m.content })),
      });
      if (data.type === 'question') {
        setMessages((m) => [...m, { role: 'assistant', content: data.question }]);
      } else {
        setResult(data);
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content:
              `Emergency ${data.emergencyId} created and coordinated.\n` +
              `Triage: ${data.triage.urgency.toUpperCase()} · ${data.triage.requiredDepartment}\n` +
              (data.bed ? `Bed reserved: ${data.ward?.name} / ${data.bed.bed_number}\n` : 'Bed: pending allocation\n') +
              (data.doctor ? `Doctor assigned: ${data.doctor.name}\n` : 'Doctor: pending\n') +
              `Doctor and ward staff have been alerted.`,
          },
        ]);
        localStorage.setItem('medagentx_last_emergency', JSON.stringify({ emergencyId: data.emergencyId, accessCode: data.accessCode }));
        push(`Emergency ${data.emergencyId} coordinated`, 'success');
      }
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `Sorry, I couldn't process that: ${err.message}` }]);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setMessages([GREETING]); setResult(null); setInput(''); };
  const copy = (text, label) => { navigator.clipboard?.writeText(text); push(`${label} copied`, 'success'); };

  return (
    <div className="chat-shell">
      <div className="card chat-card">
        <div className="chat-header">
          <div className="brand-mark" style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)' }}><Icon name="activity" size={17} /></div>
          <div className="grow">
            <b>AI Triage Assistant</b>
            <div className="tiny muted">Triage → Bed → Doctor → Alerts → Admission</div>
          </div>
          <Badge tone={busy ? 'amber' : 'green'} dot>{busy ? 'Analyzing' : 'Online'}</Badge>
        </div>

        <div className="chat-body" ref={bodyRef}>
          {messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
          {busy ? (
            <div className="bubble assistant">
              <span className="typing"><i /><i /><i /></span>
              <div className="meta">Coordinator agent working…</div>
            </div>
          ) : null}
        </div>

        {messages.filter((m) => m.role === 'user').length === 0 && !result ? (
          <div style={{ padding: '0.7rem 0.8rem 0', borderTop: '1px solid var(--slate-200)' }}>
            <div className="tiny muted mb-1">Common emergencies — tap to send:</div>
            <div className="quick-chips">
              {QUICK.map((q) => <button key={q} className="chip" onClick={() => send(q)} disabled={busy}>{q}</button>)}
            </div>
          </div>
        ) : null}

        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe the emergency…" disabled={busy || Boolean(result)} autoFocus />
          <button className="btn primary" disabled={busy || !input.trim() || Boolean(result)}>Send</button>
        </form>
      </div>

      <div className="stack">
        {!result ? (
          <div className="card">
            <h3 className="section-title"><Icon name="layers" size={17} /> How it works</h3>
            <ol className="small" style={{ paddingLeft: '1.1rem', margin: 0, color: 'var(--slate-600)' }}>
              <li>Triage Agent — urgency &amp; specialisation</li>
              <li>Bed Allocation Agent — reserves a bed</li>
              <li>Doctor Assignment Agent — on-duty doctor</li>
              <li>Notification Agent — doctor &amp; ward staff</li>
              <li>Admission Agent — builds the patient record</li>
            </ol>
            <div className="divider" />
            <p className="tiny muted" style={{ margin: 0 }}>Minimum information first. Full patient details are completed later.</p>
          </div>
        ) : <ResultPanel result={result} onCopy={copy} onReset={reset} />}
      </div>
    </div>
  );
}

function ResultPanel({ result, onCopy, onReset }) {
  const { emergency, triage, bed, ward, doctor, accessCode, trace, emergencyId } = result;
  const [deptOpen, setDeptOpen] = useState(false);
  const { push } = useToast();

  return (
    <div className="stack">
      <div className="card" style={{ borderLeft: '5px solid var(--red-500)' }}>
        <div className="row between">
          <span className="tiny muted">TEMPORARY EMERGENCY ID</span>
          <StatusBadge status={emergency.status} />
        </div>
        <h2 style={{ margin: '0.2rem 0', letterSpacing: '0.02em' }}>{emergencyId}</h2>
        <div className="row between"><span className="small muted">Access code</span><b>{accessCode}</b></div>
        <div className="row gap-sm mt-1">
          <button className="btn ghost sm" onClick={() => onCopy(emergencyId, 'Emergency ID')}>Copy ID</button>
          <button className="btn ghost sm" onClick={() => onCopy(accessCode, 'Access code')}>Copy code</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3 className="section-title"><Icon name="stethoscope" size={17} /> Triage</h3>
          <Badge tone={urgencyTone[triage.urgency]}>{triage.urgency.toUpperCase()}</Badge>
        </div>
        <div className="row gap-sm mb-1">
          <Badge tone="blue">Level {triage.triageLevel}</Badge>
          <Badge tone="teal">{triage.requiredDepartment}</Badge>
          {triage.confidence ? <Badge tone="gray">confidence {Math.round(triage.confidence * 100)}%</Badge> : null}
        </div>
        <p className="small">{triage.summary}</p>
        {triage.matchedSymptoms?.length ? (
          <div className="pill-row">{triage.matchedSymptoms.map((s) => <span key={s} className="pill">{s}</span>)}</div>
        ) : null}
        {triage.urgencyTriggers?.length ? (
          <p className="tiny" style={{ color: 'var(--red-600)' }}>Red flags: {triage.urgencyTriggers.join(', ')}</p>
        ) : null}
        <div className="divider" />
        <b className="small">Recommended preparation</b>
        <ul className="small" style={{ paddingLeft: '1.1rem', margin: '0.4rem 0 0', color: 'var(--slate-600)' }}>
          {triage.recommendedActions.map((a) => <li key={a}>{a}</li>)}
        </ul>
        <button className="btn ghost sm mt-2" onClick={() => setDeptOpen((v) => !v)}>Correct department</button>
        {deptOpen ? (
          <DepartmentOverride emergencyId={emergencyId} current={triage.requiredDepartment} onDone={(e) => { push(`Department set to ${e.required_department}`, 'success'); setDeptOpen(false); }} />
        ) : null}
      </div>

      <div className="card">
        <h3>Allocation</h3>
        <div className="grid cols-2">
          <div><div className="tiny muted">WARD / BED</div><b>{bed ? `${ward?.name} · ${bed.bed_number}` : 'Pending'}</b></div>
          <div><div className="tiny muted">DOCTOR</div><b>{doctor?.name || 'Pending'}</b><div className="tiny muted">{doctor?.specialization}</div></div>
        </div>
      </div>

      <div className="card">
        <h3>Live status</h3>
        <StatusTimeline timeline={emergency.timeline} vertical />
        <button className="btn ghost block mt-1" onClick={onReset}>New emergency</button>
      </div>

      <div className="card">
        <h3>Agent execution</h3>
        <div className="stack">
          {trace.map((t) => (
            <div key={t.step} className="row between">
              <div><b className="small">{t.agent}</b><div className="tiny muted">{t.detail}</div></div>
              <Badge tone={t.status === 'completed' ? 'green' : 'amber'}>{t.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DepartmentOverride({ emergencyId, current, onDone }) {
  const { push } = useToast();
  const [departments, setDepartments] = useState([]);
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/departments').then((d) => setDepartments(d.departments)).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.patch(`/emergency/${emergencyId}/triage`, { department: value });
      onDone(res.emergency);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row gap-sm mt-1">
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        {departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
      </select>
      <button className="btn primary sm" onClick={save} disabled={busy || value === current}>Apply</button>
    </div>
  );
}

/* =========================== Appointment mode ============================ */

const SHIFTS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
];

function AppointmentAssistant() {
  const { push } = useToast();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Appointment booking. Is this for an existing patient or a new patient?' },
  ]);
  const [stage, setStage] = useState('patientType'); // patientType | existingId | booking | done
  const [input, setInput] = useState('');
  const [patient, setPatient] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState({ doctorId: '', date: new Date().toISOString().slice(0, 10), shift: 'morning', reason: '' });
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => { api.get('/doctors').then((d) => setDoctors(d.doctors)).catch(() => {}); }, []);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, stage]);

  const say = (content) => setMessages((m) => [...m, { role: 'assistant', content }]);
  const userSaid = (content) => setMessages((m) => [...m, { role: 'user', content }]);

  const loadAvailability = async (doctorId, date) => {
    if (!doctorId || !date) return;
    try {
      const res = await api.get(`/appointments/availability?doctorId=${doctorId}&date=${date}`);
      setAvailability(res.shifts);
      if (res.shifts.length && !res.shifts.some((s) => s.shift === form.shift)) {
        setForm((f) => ({ ...f, shift: res.shifts[0].shift }));
      }
    } catch {
      setAvailability([]);
    }
  };

  useEffect(() => {
    if (stage === 'booking' && form.doctorId) loadAvailability(form.doctorId, form.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.doctorId, form.date, stage]);

  const lookupExisting = async (id) => {
    setBusy(true);
    try {
      const res = await api.get(`/patients/${id.trim()}`);
      setPatient(res.patient);
      setStage('booking');
      say(`Found ${res.patient.name} (${res.patient.id}). Choose a doctor, date and shift below, then book.`);
    } catch (err) {
      say(`I could not find a patient with that ID. ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const onRegistered = (res) => {
    setRegisterOpen(false);
    setPatient(res.patient);
    setStage('booking');
    say(`Registration complete. Patient ID: ${res.patient.id}\nPortal login — username: ${res.patientLogin.username}, access code: ${res.patientLogin.portalCode}`);
    say('Now choose a doctor, date and shift below, then book the appointment.');
    push(`Patient ${res.patient.id} registered`, 'success');
  };

  const book = async () => {
    if (!patient) return;
    if (!form.doctorId) { push('Select a doctor', 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post('/appointments', {
        patientId: patient.id,
        doctorId: form.doctorId,
        date: form.date,
        shift: form.shift,
        reason: form.reason,
      });
      const a = res.appointment;
      userSaid(`${a.doctor_name} · ${form.date} · ${a.shift}`);
      say(
        `Appointment booked.\nID: ${a.id}\nPatient: ${a.patient_name} (${patient.id})\nDoctor: ${a.doctor_name} (${a.specialization})\nWhen: ${form.date} · ${a.shift}\nReason: ${a.reason || 'OPD consultation'}`
      );
      setStage('done');
      push('Appointment booked', 'success');
    } catch (err) {
      say(err.message);
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setMessages([{ role: 'assistant', content: 'Appointment booking. Is this for an existing patient or a new patient?' }]);
    setStage('patientType');
    setPatient(null);
    setForm({ doctorId: '', date: new Date().toISOString().slice(0, 10), shift: 'morning', reason: '' });
    setAvailability([]);
  };

  const grouped = useMemo(() => {
    const map = {};
    for (const d of doctors) {
      const key = d.department_name || 'Other';
      map[key] = map[key] || [];
      map[key].push(d);
    }
    return map;
  }, [doctors]);

  return (
    <div className="chat-shell">
      <div className="card chat-card">
        <div className="chat-header">
          <div className="brand-mark" style={{ background: 'linear-gradient(135deg,#2563eb,#0d9488)' }}><Icon name="calendar" size={17} /></div>
          <div className="grow">
            <b>Appointment Assistant</b>
            <div className="tiny muted">Register · choose doctor &amp; shift · confirm</div>
          </div>
          {stage === 'done' ? <button className="btn ghost sm" onClick={reset}>New booking</button> : null}
        </div>

        <div className="chat-body" ref={bodyRef}>
          {messages.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        </div>

        {stage === 'patientType' ? (
          <div style={{ padding: '0.8rem', borderTop: '1px solid var(--slate-200)' }}>
            <div className="row gap-sm">
              <button className="btn primary" onClick={() => { userSaid('Existing patient'); setStage('existingId'); say('Please enter the Patient ID (e.g. PAT-123456).'); }}>
                <Icon name="user" size={15} /> Existing patient
              </button>
              <button className="btn" onClick={() => { userSaid('New patient'); setRegisterOpen(true); }}>
                <Icon name="plus" size={15} /> New patient
              </button>
            </div>
          </div>
        ) : null}

        {stage === 'existingId' ? (
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); const v = input.trim(); if (!v) return; userSaid(v); setInput(''); lookupExisting(v); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Enter Patient ID…" disabled={busy} autoFocus />
            <button className="btn primary" disabled={busy || !input.trim()}>Look up</button>
          </form>
        ) : null}

        {stage === 'booking' ? (
          <div style={{ padding: '0.9rem', borderTop: '1px solid var(--slate-200)', background: 'var(--slate-50)' }}>
            <div className="row between mb-1">
              <b className="small">{patient?.name} · {patient?.id}</b>
              <button className="btn ghost sm" onClick={reset}>Cancel</button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Doctor</label>
                <select value={form.doctorId} onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}>
                  <option value="">Select doctor…</option>
                  {Object.entries(grouped).map(([dept, list]) => (
                    <optgroup key={dept} label={dept}>
                      {list.map((d) => (
                        <option key={d.id} value={d.id} disabled={d.availability === 'off_duty'}>
                          {d.name} — {d.specialization}{d.availability === 'off_duty' ? ' (off duty)' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Date</label>
                <input type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="field">
                <label>Shift</label>
                <select value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}>
                  {(availability.length ? availability : SHIFTS.map((s) => ({ shift: s.key }))).map((s) => (
                    <option key={s.shift} value={s.shift} disabled={s.remaining === 0}>
                      {s.shift}{s.remaining != null ? ` · ${s.remaining} left` : ''}{s.remaining === 0 ? ' (full)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Reason</label>
                <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Fever, follow-up…" />
              </div>
            </div>
            <button className="btn primary block mt-2" onClick={book} disabled={busy || !form.doctorId}>
              {busy ? 'Booking…' : 'Confirm appointment'}
            </button>
          </div>
        ) : null}

        {stage === 'done' ? (
          <div className="chat-input">
            <button className="btn primary block" onClick={reset}><Icon name="plus" size={15} /> Book another appointment</button>
          </div>
        ) : null}
      </div>

      <div className="stack">
        <div className="card">
          <h3 className="section-title"><Icon name="clipboard" size={17} /> OPD booking</h3>
          <p className="small muted">Normal (OPD) mode requires a completed registration first. New patients are registered here and receive a Patient ID and portal access code.</p>
          <ul className="small" style={{ paddingLeft: '1.1rem', color: 'var(--slate-600)', margin: 0 }}>
            <li>Existing → enter Patient ID</li>
            <li>New → register in the popup</li>
            <li>Choose doctor, date and shift (capacity checked)</li>
          </ul>
        </div>
        <div className="card">
          <h3 className="section-title"><Icon name="clock" size={17} /> Shifts</h3>
          <div className="stack" style={{ gap: '0.4rem' }}>
            <div className="row between small"><span>Morning</span><span className="muted">09:00</span></div>
            <div className="row between small"><span>Afternoon</span><span className="muted">14:00</span></div>
            <div className="row between small"><span>Evening</span><span className="muted">18:00</span></div>
          </div>
        </div>
      </div>

      {registerOpen ? <RegisterPatientModal onClose={() => setRegisterOpen(false)} onSaved={onRegistered} /> : null}
    </div>
  );
}
