import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Badge, Loading, Modal, useToast, EmptyState, fmtTime } from '../components/ui.jsx';

const TABS = [
  { key: 'overview', label: 'Activity & Audit' },
  { key: 'users', label: 'Users & Roles' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'staff', label: 'Staff' },
  { key: 'departments', label: 'Departments' },
  { key: 'wards', label: 'Wards' },
  { key: 'beds', label: 'Beds' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'permissions', label: 'Permissions' },
];

export default function AdminManage() {
  const { push } = useToast();
  const [tab, setTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    users: [], doctors: [], staff: [], departments: [], wards: [], beds: [], inventory: [], medicines: [],
    activity: [], permissions: { roles: [], permissions: {} },
  });
  const [modal, setModal] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [users, doctors, staff, departments, wards, beds, medicines, activity, permissions] = await Promise.all([
        api.get('/admin/users'),
        api.get('/doctors'),
        api.get('/staff'),
        api.get('/departments'),
        api.get('/wards'),
        api.get('/beds'),
        api.get('/medicines'),
        api.get('/admin/activity?limit=100'),
        api.get('/admin/permissions'),
      ]);
      setData({
        users: users.users, doctors: doctors.doctors, staff: staff.staff,
        departments: departments.departments, wards: wards.wards,
        beds: beds.beds, inventory: beds.inventory, medicines: medicines.medicines,
        activity: activity.activity, permissions,
      });
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  const disableUser = async (u) => {
    if (!window.confirm(`Disable ${u.name}?`)) return;
    try {
      await api.del(`/admin/users/${u.id}`);
      push('User disabled', 'success');
      await load();
    } catch (err) { push(err.message, 'error'); }
  };

  const changeBed = async (bed, status) => {
    try {
      await api.patch(`/beds/${bed.id}`, { status });
      push('Bed updated', 'success');
      await load();
    } catch (err) { push(err.message, 'error'); }
  };

  const deleteBed = async (bed) => {
    if (!window.confirm(`Delete bed ${bed.bed_number}?`)) return;
    try {
      await api.del(`/beds/${bed.id}`);
      push('Bed deleted', 'success');
      await load();
    } catch (err) { push(err.message, 'error'); }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Administrator</div>
          <h1>System management</h1>
        </div>
        <button className="btn ghost" onClick={load}>Refresh</button>
      </div>

      <div className="row wrap gap-sm">
        {TABS.map((t) => (
          <button key={t.key} className={`btn sm ${tab === t.key ? 'primary' : 'ghost'}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? <Loading /> : (
        <>
          {tab === 'overview' ? <ActivityTab activity={data.activity} /> : null}

          {tab === 'users' ? (
            <Section title="User accounts" action={<button className="btn primary sm" onClick={() => setModal('user')}>+ New user</button>}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Linked</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.id}>
                        <td><b>{u.name}</b><div className="tiny muted">{u.email || ''}</div></td>
                        <td>{u.username}</td>
                        <td><Badge tone="teal">{u.role.replace('_', ' ')}</Badge></td>
                        <td className="small">{u.doctor_name || u.staff_name || u.patient_id || '—'}</td>
                        <td><Badge tone={u.active ? 'green' : 'gray'}>{u.active ? 'active' : 'disabled'}</Badge></td>
                        <td className="right">{u.role !== 'admin' && u.active ? <button className="btn ghost sm" onClick={() => disableUser(u)}>Disable</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {tab === 'doctors' ? (
            <Section title="Doctors" action={<button className="btn primary sm" onClick={() => setModal('doctor')}>+ New doctor</button>}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Doctor ID</th><th>Name</th><th>Specialization</th><th>Department</th><th>Availability</th><th>Contact</th><th></th></tr></thead>
                  <tbody>
                    {data.doctors.map((d) => (
                      <tr key={d.id}>
                        <td><b>{d.id}</b></td>
                        <td>{d.name}</td>
                        <td>{d.specialization}</td>
                        <td>{d.department_name}</td>
                        <td><Badge tone={d.availability === 'available' ? 'green' : d.availability === 'busy' ? 'amber' : 'gray'} dot>{d.availability.replace('_', ' ')}</Badge></td>
                        <td className="small">{d.phone || '—'}<div className="tiny muted">{d.email || ''}</div></td>
                        <td className="right"><button className="btn ghost sm" onClick={() => setScheduleFor(d)}>Schedule</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {tab === 'staff' ? (
            <Section title="Emergency / ward &amp; reception staff" action={<button className="btn primary sm" onClick={() => setModal('staff')}>+ New staff</button>}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Staff ID</th><th>Name</th><th>Role</th><th>Ward</th><th>Status</th><th>Contact</th></tr></thead>
                  <tbody>
                    {data.staff.map((s) => (
                      <tr key={s.id}>
                        <td><b>{s.id}</b></td>
                        <td>{s.name}</td>
                        <td><Badge tone="teal">{s.role.replace('_', ' ')}</Badge></td>
                        <td>{s.ward_name || '—'}</td>
                        <td><Badge tone={s.status === 'on_duty' ? 'green' : 'gray'} dot>{s.status.replace('_', ' ')}</Badge></td>
                        <td className="small">{s.phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {tab === 'departments' ? (
            <Section title="Departments" action={<button className="btn primary sm" onClick={() => setModal('department')}>+ New department</button>}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ID</th><th>Name</th><th>Code</th><th>Description</th></tr></thead>
                  <tbody>
                    {data.departments.map((d) => (
                      <tr key={d.id}><td><b>{d.id}</b></td><td>{d.name}</td><td>{d.code}</td><td className="small">{d.description}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {tab === 'wards' ? (
            <Section title="Wards" action={<button className="btn primary sm" onClick={() => setModal('ward')}>+ New ward</button>}>
              <div className="grid auto">
                {data.wards.map((w) => (
                  <div key={w.id} className="card">
                    <div className="row between"><b>{w.name}</b><Badge tone="gray">{w.type}</Badge></div>
                    <div className="small muted">Floor {w.floor || '—'} · {w.description || ''}</div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {tab === 'beds' ? (
            <Section title="Beds" action={<button className="btn primary sm" onClick={() => setModal('bed')}>+ New bed</button>}>
              <div className="grid auto">
                {data.wards.map((w) => (
                  <div key={w.id} className="card">
                    <b>{w.name}</b>
                    <div className="stack mt-1" style={{ gap: '0.4rem' }}>
                      {data.beds.filter((b) => b.ward_id === w.id).map((b) => (
                        <div key={b.id} className="row between">
                          <span className="small"><b>{b.bed_number}</b> <span className="muted">{b.bed_type}</span></span>
                          <div className="row gap-sm">
                            <select value={b.status} onChange={(e) => changeBed(b, e.target.value)} style={{ width: 130, padding: '0.25rem 0.4rem', fontSize: '0.78rem' }}>
                              {['available', 'reserved', 'occupied', 'cleaning', 'maintenance'].map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button className="btn ghost sm" onClick={() => deleteBed(b)}>×</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {tab === 'medicines' ? (
            <Section title="Medicine catalog" action={<button className="btn primary sm" onClick={() => setModal('medicine')}>+ New medicine</button>}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Medicine ID</th><th>Name</th><th>Form</th><th>Strength</th><th>Quantity</th></tr></thead>
                  <tbody>
                    {data.medicines.map((m) => (
                      <tr key={m.id}><td><b>{m.id}</b></td><td>{m.name}</td><td>{m.form}</td><td>{m.strength}</td><td>{m.quantity}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}

          {tab === 'permissions' ? (
            <Section title="Roles &amp; permissions">
              <div className="grid cols-2">
                {Object.entries(data.permissions.permissions).map(([role, perms]) => (
                  <div key={role} className="card">
                    <div className="row between mb-1"><b style={{ textTransform: 'capitalize' }}>{role.replace('_', ' ')}</b><Badge tone="teal">{perms.includes('*') ? 'full access' : `${perms.length} permissions`}</Badge></div>
                    <div className="pill-row">
                      {perms.map((p) => <span key={p} className="pill">{p}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}

      {modal ? (
        <CreateModal
          type={modal}
          data={data}
          onClose={() => setModal(null)}
          onSaved={async () => { setModal(null); await load(); }}
        />
      ) : null}

      {scheduleFor ? (
        <ScheduleModal
          doctor={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onSaved={async () => { setScheduleFor(null); await load(); }}
        />
      ) : null}
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div className="stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function ActivityTab({ activity }) {
  if (!activity.length) return <div className="card"><EmptyState icon="file-text" title="No activity recorded" /></div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
        <tbody>
          {activity.map((l) => (
            <tr key={l.id}>
              <td className="small nowrap">{fmtTime(l.created_at)}</td>
              <td className="small">{l.actor_name || 'system'}<div className="tiny muted">{l.actor_role || ''}</div></td>
              <td><Badge tone="teal">{l.action}</Badge></td>
              <td className="small">{l.entity} {l.entity_id || ''}</td>
              <td className="tiny muted" style={{ maxWidth: 320, whiteSpace: 'pre-wrap' }}>{l.details || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateModal({ type, data, onClose, onSaved }) {
  const { push } = useToast();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const configs = {
    user: {
      title: 'New user account',
      endpoint: '/admin/users',
      fields: [
        { k: 'name', label: 'Full name', required: true },
        { k: 'username', label: 'Username', required: true },
        { k: 'password', label: 'Password', type: 'password', required: true },
        { k: 'role', label: 'Role', type: 'select', options: ['admin', 'reception', 'ward_staff', 'doctor'], required: true },
        { k: 'email', label: 'Email' },
        { k: 'phone', label: 'Phone' },
      ],
    },
    doctor: {
      title: 'New doctor',
      endpoint: '/doctors',
      fields: [
        { k: 'name', label: 'Name', required: true },
        { k: 'specialization', label: 'Specialization', required: true },
        { k: 'departmentId', label: 'Department', type: 'select', options: data.departments.map((d) => ({ value: d.id, label: d.name })), required: true },
        { k: 'availability', label: 'Availability', type: 'select', options: ['available', 'busy', 'off_duty'] },
        { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' }, { k: 'room', label: 'Room' },
      ],
    },
    staff: {
      title: 'New staff member',
      endpoint: '/staff',
      fields: [
        { k: 'name', label: 'Name', required: true },
        { k: 'role', label: 'Role', type: 'select', options: ['ward_staff', 'reception'], required: true },
        { k: 'wardId', label: 'Ward', type: 'select', options: data.wards.map((w) => ({ value: w.id, label: w.name })) },
        { k: 'status', label: 'Status', type: 'select', options: ['on_duty', 'off_duty'] },
        { k: 'phone', label: 'Phone' }, { k: 'email', label: 'Email' },
      ],
    },
    department: {
      title: 'New department',
      endpoint: '/departments',
      fields: [{ k: 'name', label: 'Name', required: true }, { k: 'code', label: 'Code', required: true }, { k: 'description', label: 'Description' }],
    },
    ward: {
      title: 'New ward',
      endpoint: '/wards',
      fields: [
        { k: 'name', label: 'Name', required: true },
        { k: 'type', label: 'Type', type: 'select', options: ['emergency', 'icu', 'general', 'pediatric', 'cardiology'], required: true },
        { k: 'floor', label: 'Floor' }, { k: 'description', label: 'Description' },
      ],
    },
    bed: {
      title: 'New bed',
      endpoint: '/beds',
      fields: [
        { k: 'wardId', label: 'Ward', type: 'select', options: data.wards.map((w) => ({ value: w.id, label: w.name })), required: true },
        { k: 'bedNumber', label: 'Bed number', required: true },
        { k: 'bedType', label: 'Bed type', type: 'select', options: ['emergency', 'icu', 'general', 'pediatric', 'cardiac'], required: true },
      ],
    },
    medicine: {
      title: 'New medicine',
      endpoint: '/medicines',
      fields: [
        { k: 'name', label: 'Name', required: true },
        { k: 'form', label: 'Form', type: 'select', options: ['tablet', 'capsule', 'syrup', 'injection', 'infusion'], required: true },
        { k: 'strength', label: 'Strength' }, { k: 'quantity', label: 'Quantity', type: 'number' },
      ],
    },
  };

  const cfg = configs[type];

  const save = async () => {
    for (const f of cfg.fields) {
      if (f.required && !String(form[f.k] || '').trim()) {
        push(`${f.label} is required`, 'error');
        return;
      }
    }
    setBusy(true);
    try {
      const body = { ...form };
      if (body.quantity !== undefined) body.quantity = Number(body.quantity || 0);
      await api.post(cfg.endpoint, body);
      push('Created successfully', 'success');
      await onSaved();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={cfg.title}
      onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Create'}</button></>}
    >
      <div className="form-grid">
        {cfg.fields.map((f) => (
          <div key={f.k} className="field">
            <label>{f.label}{f.required ? ' *' : ''}</label>
            {f.type === 'select' ? (
              <select value={form[f.k] || ''} onChange={set(f.k)}>
                <option value="">Select…</option>
                {(f.options || []).map((o) => (
                  typeof o === 'string'
                    ? <option key={o} value={o}>{o.replace('_', ' ')}</option>
                    : <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input type={f.type || 'text'} value={form[f.k] || ''} onChange={set(f.k)} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

const DAYS = [
  { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 }, { label: 'Wednesday', value: 3 },
  { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 },
  { label: 'Sunday', value: 0 },
];
const SHIFT_LIST = ['morning', 'afternoon', 'evening'];

function ScheduleModal({ doctor, onClose, onSaved }) {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState([]);
  const [slots, setSlots] = useState({}); // key `${day}-${shift}` -> { id, max }

  useEffect(() => {
    api.get(`/doctors/${doctor.id}/schedule`)
      .then((d) => {
        const map = {};
        for (const s of d.schedule) map[`${s.day_of_week}-${s.shift}`] = { id: s.id, max: s.max_patients };
        setOriginal(d.schedule);
        setSlots(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [doctor.id]);

  const toggle = (day, shift) => {
    const key = `${day}-${shift}`;
    setSlots((s) => {
      const next = { ...s };
      if (next[key]) delete next[key];
      else next[key] = { id: null, max: 10 };
      return next;
    });
  };

  const setMax = (day, shift, value) => {
    const key = `${day}-${shift}`;
    setSlots((s) => ({ ...s, [key]: { ...s[key], max: Number(value) || 0 } }));
  };

  const save = async () => {
    setBusy(true);
    try {
      for (const s of original) {
        const key = `${s.day_of_week}-${s.shift}`;
        if (!slots[key]) await api.del(`/doctor-schedule/${s.id}`);
      }
      for (const [key, val] of Object.entries(slots)) {
        const [day, shift] = key.split('-');
        await api.post(`/doctors/${doctor.id}/schedule`, { dayOfWeek: Number(day), shift, maxPatients: val.max });
      }
      push('Schedule saved', 'success');
      await onSaved();
    } catch (err) {
      push(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`OPD schedule · ${doctor.name}`}
      onClose={onClose}
      wide
      footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save schedule'}</button></>}
    >
      {loading ? <Loading /> : (
        <>
          <p className="small muted">Select shifts per weekday and set the maximum patients per shift.</p>
          <div className="schedule-grid mb-1">
            <div className="head">Day</div>
            {SHIFT_LIST.map((s) => <div key={s} className="head" style={{ textAlign: 'center' }}>{s}</div>)}
          </div>
          {DAYS.map((d) => (
            <div key={d.value} className="schedule-grid mb-1">
              <div className="small" style={{ fontWeight: 600 }}>{d.label}</div>
              {SHIFT_LIST.map((shift) => {
                const key = `${d.value}-${shift}`;
                const active = Boolean(slots[key]);
                return (
                  <div key={shift} className="slot-container">
                    <button
                      type="button"
                      className={`slot ${active ? 'on' : ''}`}
                      style={{ width: '100%' }}
                      onClick={() => toggle(d.value, shift)}
                    >
                      {active ? 'On' : 'Off'}
                    </button>
                    {active ? (
                      <input
                        type="number"
                        min="1"
                        value={slots[key].max}
                        onChange={(e) => setMax(d.value, shift, e.target.value)}
                        style={{ marginTop: 4, padding: '0.25rem 0.4rem', fontSize: '0.76rem' }}
                        title="Max patients"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}
