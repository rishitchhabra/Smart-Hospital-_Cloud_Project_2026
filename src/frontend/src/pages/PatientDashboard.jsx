import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { Badge, Loading, Modal, useToast, fmtTime } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

const SHIFTS = ['morning', 'afternoon', 'evening'];

const PHARMACY_STATUS = {
  pending: { label: 'Sent to pharmacy', tone: 'gray' },
  preparing: { label: 'Being prepared', tone: 'amber' },
  ready: { label: 'Ready for pickup', tone: 'green' },
  dispensed: { label: 'Dispensed', tone: 'teal' },
};

export default function PatientDashboard() {
  const { push } = useToast();
  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get('/patients/me');
      setPatient(data.patient);
      setAppointments(data.appointments || []);
    } catch (err) {
      if (!silent) push(err.message, 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20000);
    return () => clearInterval(t);
  }, [load]);

  const routine = useMemo(() => {
    if (!patient?.prescriptions) return [];
    const buckets = {};
    for (const rx of patient.prescriptions) {
      for (const it of rx.items || []) {
        for (const t of it.schedule?.times || ['As directed']) {
          buckets[t] = buckets[t] || [];
          buckets[t].push({ ...it, doctor: rx.doctor_name, fulfillment: rx.fulfillment_status });
        }
      }
    }
    const order = ['Morning', 'Afternoon', 'Night', 'As needed', 'As directed', 'Immediately'];
    return Object.entries(buckets).sort((a, b) => {
      const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [patient]);

  if (loading) return <Loading label="Loading your health record…" />;
  if (!patient) return <div className="card empty">No patient record linked to this account.</div>;

  const admission = patient.admission;
  const prescriptions = (patient.prescriptions || []).filter((p) => p.status !== 'note');
  const upcoming = appointments.filter((a) => a.status === 'scheduled');
  const readyCount = prescriptions.filter((p) => p.fulfillment_status === 'ready').length;
  const pharmacyStatusOf = (rx) => PHARMACY_STATUS[rx.fulfillment_status] || PHARMACY_STATUS.pending;

  return (
    <div className="stack">
      <div className="hero">
        <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.8)' }}>Patient Dashboard</div>
        <h2 style={{ marginBottom: 4 }}>Hello, {patient.name}</h2>
        <p>
          Your ID: <b>{patient.id}</b>
          {patient.emergency_id ? <> · Emergency: <b>{patient.emergency_id}</b></> : <> · Outpatient (OPD)</>}
        </p>
      </div>

      <div className="grid cols-4">
        <div className="stat accent">
          <div className="label">Status</div>
          <div className="value" style={{ fontSize: '1.3rem', textTransform: 'capitalize' }}>{admission?.status?.replace('_', ' ') || (patient.patient_type === 'opd' ? 'Outpatient' : 'Admitted')}</div>
          <div className="sub">{admission ? `since ${fmtTime(admission.admitted_at)}` : 'OPD record'}</div>
        </div>
        <div className="stat info">
          <div className="label">Assigned doctor</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>{admission?.doctor_name || appointments[0]?.doctor_name || '—'}</div>
          <div className="sub">{admission?.specialization || appointments[0]?.specialization || ''}</div>
        </div>
        <div className="stat ok">
          <div className="label">Ward</div>
          <div className="value" style={{ fontSize: '1.1rem' }}>{admission?.ward_name || '—'}</div>
          <div className="sub">Bed {admission?.bed_number || '—'}</div>
        </div>
        <div className="stat warn">
          <div className="label">Medicines</div>
          <div className="value">{prescriptions.reduce((s, p) => s + (p.items?.length || 0), 0)}</div>
          <div className="sub">{readyCount > 0 ? `${readyCount} ready at pharmacy` : 'active prescriptions'}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h3 className="section-title"><Icon name="calendar" size={17} /> Appointments</h3>
          <button className="btn primary sm" onClick={() => setBookOpen(true)}><Icon name="plus" size={14} /> Book appointment</button>
        </div>
        {upcoming.length === 0 && appointments.length === 0 ? (
          <p className="muted small">No appointments yet. Book an OPD appointment with a doctor.</p>
        ) : (
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>When</th><th>Doctor</th><th>Shift</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id}>
                    <td><b>{a.scheduled_at ? new Date(a.scheduled_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</b></td>
                    <td>{a.doctor_name}<div className="tiny muted">{a.specialization}</div></td>
                    <td style={{ textTransform: 'capitalize' }}>{a.shift || '—'}</td>
                    <td>{a.reason || '—'}</td>
                    <td><Badge tone={a.status === 'scheduled' ? 'teal' : a.status === 'completed' ? 'green' : 'gray'}>{a.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3 className="section-title"><Icon name="clock" size={17} /> Today&apos;s medicine routine</h3>
          {routine.length === 0 ? (
            <p className="muted small">No medicines scheduled yet.</p>
          ) : routine.map(([time, meds]) => (
            <div key={time} className="mb-2">
              <div className="row gap-sm mb-1">
                <Badge tone="teal">{time}</Badge>
                <span className="tiny muted">{meds.length} medicine{meds.length > 1 ? 's' : ''}</span>
              </div>
              <div className="stack" style={{ gap: '0.5rem' }}>
                {meds.map((m, i) => (
                  <div key={i} className="med-card">
                    <div className="row between">
                      <span className="name">{m.medicine_name}</span>
                      <span className="row gap-sm">
                        <span className="pill teal">{m.dosage}</span>
                        <Badge tone={(PHARMACY_STATUS[m.fulfillment] || PHARMACY_STATUS.pending).tone}>
                          {(PHARMACY_STATUS[m.fulfillment] || PHARMACY_STATUS.pending).label}
                        </Badge>
                      </span>
                    </div>
                    <div className="small muted">{m.before_after_food || 'as directed'}{m.instructions ? ` · ${m.instructions}` : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 className="section-title"><Icon name="pill" size={17} /> Prescriptions &amp; instructions</h3>
          {prescriptions.length === 0 ? (
            <p className="muted small">No prescriptions yet.</p>
          ) : prescriptions.map((rx) => {
            const ps = pharmacyStatusOf(rx);
            return (
              <div key={rx.id} className="mb-2">
                <div className="row between">
                  <b className="small">{rx.diagnosis || 'Prescription'}</b>
                  <span className="row gap-sm">
                    <Badge tone={ps.tone} dot>{ps.label}</Badge>
                    <span className="tiny muted">{fmtTime(rx.created_at)}</span>
                  </span>
                </div>
                {rx.clinical_notes ? <p className="small muted">{rx.clinical_notes}</p> : null}
                <div className="small">
                  {(rx.items || []).map((it) => (
                    <div key={it.id} className="row between" style={{ padding: '0.3rem 0', borderBottom: '1px solid var(--slate-100)' }}>
                      <span><b>{it.medicine_name}</b> · {it.dosage} · {it.frequency}</span>
                      <span className="muted">{it.duration}</span>
                    </div>
                  ))}
                </div>
                <div className="tiny muted mt-1">
                  Prescribed by {rx.doctor_name || 'your doctor'}
                  {rx.fulfillment_status === 'dispensed' && rx.dispensed_at ? ` · dispensed ${fmtTime(rx.dispensed_at)}` : ''}
                  {rx.fulfillment_status === 'ready' ? ' · collect from the pharmacy' : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>My details</h3>
        <dl className="kv">
          <dt>Patient ID</dt><dd>{patient.id}</dd>
          <dt>Type</dt><dd style={{ textTransform: 'capitalize' }}>{patient.patient_type || 'opd'}</dd>
          <dt>Age / Gender</dt><dd>{patient.age || '—'} / {patient.gender || '—'}</dd>
          <dt>Blood group</dt><dd>{patient.blood_group || '—'}</dd>
          <dt>Contact</dt><dd>{patient.contact || '—'}</dd>
          <dt>Allergies</dt><dd>{patient.allergies || 'None recorded'}</dd>
        </dl>
      </div>

      {bookOpen ? (
        <BookAppointmentModal
          onClose={() => setBookOpen(false)}
          onSaved={async () => { setBookOpen(false); await load(true); }}
        />
      ) : null}
    </div>
  );
}

function BookAppointmentModal({ onClose, onSaved }) {
  const { push } = useToast();
  const [doctors, setDoctors] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [form, setForm] = useState({ doctorId: '', date: new Date().toISOString().slice(0, 10), shift: 'morning', reason: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/appointments/doctors').then((d) => setDoctors(d.doctors)).catch(() => {}); }, []);

  useEffect(() => {
    if (!form.doctorId || !form.date) { setAvailability([]); return; }
    api.get(`/appointments/availability?doctorId=${form.doctorId}&date=${form.date}`)
      .then((res) => {
        setAvailability(res.shifts);
        if (res.shifts.length && !res.shifts.some((s) => s.shift === form.shift)) {
          setForm((f) => ({ ...f, shift: res.shifts[0].shift }));
        }
      })
      .catch(() => setAvailability([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.doctorId, form.date]);

  const grouped = useMemo(() => {
    const map = {};
    for (const d of doctors) {
      const key = d.department_name || 'Other';
      map[key] = map[key] || [];
      map[key].push(d);
    }
    return map;
  }, [doctors]);

  const save = async () => {
    if (!form.doctorId) { push('Select a doctor', 'error'); return; }
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
      title="Book an appointment"
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Booking…' : 'Confirm'}</button></>}
    >
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
        <div className="field"><label>Date</label><input type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></div>
        <div className="field">
          <label>Shift</label>
          <select value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}>
            {(availability.length ? availability : SHIFTS.map((s) => ({ shift: s }))).map((s) => (
              <option key={s.shift} value={s.shift} disabled={s.remaining === 0}>
                {s.shift}{s.remaining != null ? ` · ${s.remaining} left` : ''}{s.remaining === 0 ? ' (full)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field"><label>Reason</label><input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Fever, follow-up…" /></div>
      </div>
      {availability.length ? (
        <p className="tiny muted mt-1">
          Slots: {availability.map((s) => `${s.shift} ${s.remaining}/${s.maxPatients}`).join(' · ')}
        </p>
      ) : null}
    </Modal>
  );
}
