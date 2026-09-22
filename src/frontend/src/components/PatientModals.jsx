import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Modal, useToast } from './ui.jsx';
import Icon from './Icon.jsx';

/**
 * Admission form — used by reception and by the assigned doctor to convert a
 * temporary Emergency ID into a complete patient record (Admission Agent).
 */
export function AdmissionModal({ emergency, onClose, onSaved }) {
  const { push } = useToast();
  const [form, setForm] = useState({
    name: '', age: '', gender: '', contact: '', address: '', blood_group: '',
    attendant_name: '', attendant_contact: '', medical_history: '', allergies: '',
    emergency_details: emergency.summary || '', admission_notes: '',
  });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { push('Patient name is required', 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post(`/emergency/${emergency.id}/admit`, form);
      push(`Admitted as ${res.patient.id}`, 'success');
      await onSaved(res);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Patient registration · ${emergency.id}`}
      onClose={onClose}
      wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Convert to patient record'}</button></>}
    >
      <div className="stack">
        <div className="card" style={{ background: 'var(--teal-50)', boxShadow: 'none' }}>
          <div className="small"><b>Emergency:</b> {emergency.summary}</div>
          <div className="small muted">Ward: {emergency.ward?.name || '—'} · Bed: {emergency.bed?.bed_number || '—'} · Doctor: {emergency.doctor?.name || '—'}</div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Full name *</label><input value={form.name} onChange={set('name')} /></div>
          <div className="field"><label>Age</label><input type="number" value={form.age} onChange={set('age')} /></div>
          <div className="field">
            <label>Gender</label>
            <select value={form.gender} onChange={set('gender')}>
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field"><label>Blood group</label><input value={form.blood_group} onChange={set('blood_group')} placeholder="O+" /></div>
          <div className="field"><label>Contact</label><input value={form.contact} onChange={set('contact')} /></div>
          <div className="field"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
          <div className="field"><label>Attendant name</label><input value={form.attendant_name} onChange={set('attendant_name')} /></div>
          <div className="field"><label>Attendant contact</label><input value={form.attendant_contact} onChange={set('attendant_contact')} /></div>
        </div>
        <div className="field"><label>Emergency details</label><textarea rows={2} value={form.emergency_details} onChange={set('emergency_details')} /></div>
        <div className="field"><label>Relevant medical history</label><textarea rows={2} value={form.medical_history} onChange={set('medical_history')} placeholder="Diabetes, hypertension, previous surgeries…" /></div>
        <div className="field"><label>Allergies</label><input value={form.allergies} onChange={set('allergies')} /></div>
        <div className="field"><label>Admission notes</label><input value={form.admission_notes} onChange={set('admission_notes')} /></div>
      </div>
    </Modal>
  );
}

/** Update non-clinical patient demographics. */
export function EditPatientModal({ patient, onClose, onSaved }) {
  const { push } = useToast();
  const [form, setForm] = useState({
    name: patient.name || '', age: patient.age || '', gender: patient.gender || '',
    contact: patient.contact || '', address: patient.address || '', blood_group: patient.blood_group || '',
    attendant_name: patient.attendant_name || '', attendant_contact: patient.attendant_contact || '',
    medical_history: patient.medical_history || '', allergies: patient.allergies || '',
    emergency_details: patient.emergency_details || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/patients/${patient.id}`, form);
      push('Patient details updated', 'success');
      await onSaved();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Update details · ${patient.id}`}
      onClose={onClose}
      wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></>}
    >
      <div className="form-grid">
        <div className="field"><label>Name</label><input value={form.name} onChange={set('name')} /></div>
        <div className="field"><label>Age</label><input type="number" value={form.age} onChange={set('age')} /></div>
        <div className="field"><label>Gender</label><input value={form.gender} onChange={set('gender')} /></div>
        <div className="field"><label>Blood group</label><input value={form.blood_group} onChange={set('blood_group')} /></div>
        <div className="field"><label>Contact</label><input value={form.contact} onChange={set('contact')} /></div>
        <div className="field"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
        <div className="field"><label>Attendant name</label><input value={form.attendant_name} onChange={set('attendant_name')} /></div>
        <div className="field"><label>Attendant contact</label><input value={form.attendant_contact} onChange={set('attendant_contact')} /></div>
        <div className="field"><label>Allergies</label><input value={form.allergies} onChange={set('allergies')} /></div>
        <div className="field"><label>Medical history</label><input value={form.medical_history} onChange={set('medical_history')} /></div>
      </div>
    </Modal>
  );
}

/** Register an OPD (outpatient) patient and provision their portal login. */
export function RegisterPatientModal({ onClose, onSaved, title = 'Register new patient (OPD)' }) {
  const { push } = useToast();
  const [form, setForm] = useState({ name: '', age: '', gender: '', contact: '', address: '', blood_group: '', medical_history: '', allergies: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.name.trim()) { push('Name is required', 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post('/patients', form);
      push(`Registered ${res.patient.id}`, 'success');
      onSaved(res);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Registering…' : 'Register patient'}</button></>}
    >
      <div className="form-grid">
        <div className="field"><label>Full name *</label><input value={form.name} onChange={set('name')} autoFocus /></div>
        <div className="field"><label>Age</label><input type="number" value={form.age} onChange={set('age')} /></div>
        <div className="field">
          <label>Gender</label>
          <select value={form.gender} onChange={set('gender')}>
            <option value="">Select…</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
          </select>
        </div>
        <div className="field"><label>Contact</label><input value={form.contact} onChange={set('contact')} /></div>
        <div className="field"><label>Address</label><input value={form.address} onChange={set('address')} /></div>
        <div className="field"><label>Blood group</label><input value={form.blood_group} onChange={set('blood_group')} placeholder="O+" /></div>
        <div className="field"><label>Medical history</label><input value={form.medical_history} onChange={set('medical_history')} /></div>
        <div className="field"><label>Allergies</label><input value={form.allergies} onChange={set('allergies')} /></div>
      </div>
    </Modal>
  );
}

/** Reception: book an appointment for a selected patient. */
export function StaffAppointmentModal({ onClose, onSaved }) {
  const { push } = useToast();
  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState({ patientId: '', doctorId: '', date: new Date().toISOString().slice(0, 10), shift: 'morning', reason: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/patients').then((d) => setPatients(d.patients)).catch(() => {});
    api.get('/appointments/doctors').then((d) => setDoctors(d.doctors)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.doctorId || !form.date) { setAvailability([]); return; }
    api.get(`/appointments/availability?doctorId=${form.doctorId}&date=${form.date}`)
      .then((res) => {
        setAvailability(res.shifts);
        if (res.shifts.length && !res.shifts.some((s) => s.shift === form.shift)) setForm((f) => ({ ...f, shift: res.shifts[0].shift }));
      })
      .catch(() => setAvailability([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.doctorId, form.date]);

  const grouped = useMemo(() => {
    const map = {};
    for (const d of doctors) { const k = d.department_name || 'Other'; map[k] = map[k] || []; map[k].push(d); }
    return map;
  }, [doctors]);

  const save = async () => {
    if (!form.patientId || !form.doctorId) { push('Select patient and doctor', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/appointments', form);
      push('Appointment booked', 'success');
      await onSaved();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Book appointment"
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Booking…' : 'Confirm'}</button></>}
    >
      <div className="form-grid">
        <div className="field">
          <label>Patient</label>
          <select value={form.patientId} onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}>
            <option value="">Select patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Doctor</label>
          <select value={form.doctorId} onChange={(e) => setForm((f) => ({ ...f, doctorId: e.target.value }))}>
            <option value="">Select doctor…</option>
            {Object.entries(grouped).map(([dept, list]) => (
              <optgroup key={dept} label={dept}>
                {list.map((d) => <option key={d.id} value={d.id} disabled={d.availability === 'off_duty'}>{d.name} — {d.specialization}{d.availability === 'off_duty' ? ' (off duty)' : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field"><label>Date</label><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
        <div className="field">
          <label>Shift</label>
          <select value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}>
            {(availability.length ? availability : ['morning', 'afternoon', 'evening'].map((s) => ({ shift: s }))).map((s) => (
              <option key={s.shift} value={s.shift} disabled={s.remaining === 0}>{s.shift}{s.remaining != null ? ` · ${s.remaining} left` : ''}{s.remaining === 0 ? ' (full)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="field"><label>Reason</label><input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div>
      </div>
      {availability.length ? <p className="tiny muted mt-1">Slots: {availability.map((s) => `${s.shift} ${s.remaining}/${s.maxPatients}`).join(' · ')}</p> : null}
      <p className="tiny muted mt-1"><Icon name="clock" size={12} /> Morning 09:00 · Afternoon 14:00 · Evening 18:00</p>
    </Modal>
  );
}

/** Shows a patient's portal login details for staff to hand to the patient. */
export function PatientCredentialsModal({ creds, onClose, onReissue }) {
  const { push } = useToast();
  const copy = (text, label) => { navigator.clipboard?.writeText(text); push(`${label} copied`, 'success'); };
  return (
    <Modal
      title={`Patient login · ${creds.patientId}`}
      onClose={onClose}
      footer={onReissue ? <button className="btn ghost" onClick={onReissue}>Issue new code</button> : null}
    >
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          The patient signs in on the login page → <b>Patient / Attendant</b> using these details.
        </p>
        <div className="card" style={{ background: 'var(--teal-50)', boxShadow: 'none' }}>
          <div className="row between"><span className="small muted">Patient ID</span><b>{creds.patientId}</b></div>
          <div className="divider" />
          <div className="row between"><span className="small muted">Username</span><b>{creds.username}</b></div>
          <div className="row between mt-1"><span className="small muted">Access code</span><b style={{ fontSize: '1.15rem', letterSpacing: '0.06em' }}>{creds.accessCode}</b></div>
        </div>
        <div className="row gap-sm">
          <button className="btn ghost sm" onClick={() => copy(creds.patientId, 'Patient ID')}>Copy ID</button>
          <button className="btn ghost sm" onClick={() => copy(creds.accessCode, 'Access code')}>Copy code</button>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>Tip: the patient can also track an emergency by Emergency ID without a code.</p>
      </div>
    </Modal>
  );
}
