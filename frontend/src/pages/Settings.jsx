import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../services/api';
import TopBar from '../components/TopBar';

const ROLE_NAMES = { receptionist: 'Receptionist', clinician: 'Clinician', manager: 'Clinic manager', admin: 'Administrator' };
const ROLE_PILL = { receptionist: 'is-blue', clinician: 'is-green', manager: 'is-orange', admin: 'is-red' };

const FIELD_LABELS = {
  default_minutes: 'default time (min)', active_clinicians: 'active clinicians', buffer_ratio: 'buffer',
  is_default: 'default visit type', is_active: 'active', name: 'name', created: 'added',
  full_name: 'name', role: 'role', service_point: 'service point', password: 'password',
};
const ENTITY_NAMES = { service_point: 'Service point', visit_type: 'Visit type', staff: 'Staff' };

const when = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });
const pwProblem = (pw, username) => {
  if (!pw || pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use both letters and numbers.';
  if (username && pw.toLowerCase() === username.toLowerCase()) return 'The password cannot be the same as the username.';
  return null;
};

const S = {
  num: { width: 90 },
  inline: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'end' },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 500, color: 'var(--hq-label-2)', borderBottom: '1px solid var(--hq-separator)' },
  td: { padding: '8px 10px', borderBottom: '1px solid rgba(60,60,67,0.08)', verticalAlign: 'middle' },
  small: { minHeight: 34, padding: '6px 12px', fontSize: 14 },
};

function Modal({ title, children, onClose }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="hq-panel" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <h2 className="hq-title" style={{ marginBottom: 14 }}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ====================== Service points ====================== */

function ServicePointPanel({ sp, types, onSaveSp, onSaveVt, onAddVt, busy }) {
  const [name, setName] = useState(sp.name);
  const [clin, setClin] = useState(String(sp.active_clinicians));
  const [buf, setBuf] = useState(String(Math.round(sp.buffer_ratio * 100)));
  const changed = name.trim() !== sp.name || clin !== String(sp.active_clinicians)
    || buf !== String(Math.round(sp.buffer_ratio * 100));

  return (
    <section className="hq-panel" style={{ marginBottom: 20, opacity: sp.is_active ? 1 : 0.65 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 className="hq-title" style={{ fontSize: 19 }}>{sp.name}</h3>
        <span className="hq-pill">Token prefix {sp.code}</span>
        <span className={`hq-pill ${sp.is_active ? 'is-green' : ''}`}>{sp.is_active ? 'Active' : 'Inactive'}</span>
        <button type="button" className={`hq-btn ${sp.is_active ? 'hq-btn-destructive' : 'hq-btn-secondary'}`}
          style={{ ...S.small, marginLeft: 'auto' }} disabled={busy}
          onClick={() => {
            if (!sp.is_active || window.confirm(`Deactivate ${sp.name}? It will no longer appear at reception or on the display. Its history is kept.`)) {
              onSaveSp(sp.id, { is_active: !sp.is_active });
            }
          }}>
          {sp.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </div>

      <div style={S.inline}>
        <div className="hq-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <label htmlFor={`spn-${sp.id}`}>Name</label>
          <input id={`spn-${sp.id}`} className="hq-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor={`spc-${sp.id}`}>Active clinicians</label>
          <input id={`spc-${sp.id}`} className="hq-input hq-num" style={S.num} type="number" min="1" max="10"
            value={clin} onChange={(e) => setClin(e.target.value)} />
        </div>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor={`spb-${sp.id}`}>Safety buffer (%)</label>
          <input id={`spb-${sp.id}`} className="hq-input hq-num" style={S.num} type="number" min="0" max="50"
            value={buf} onChange={(e) => setBuf(e.target.value)} />
        </div>
        <button type="button" className="hq-btn hq-btn-primary" style={{ minHeight: 44 }} disabled={!changed || busy}
          onClick={() => onSaveSp(sp.id, {
            name: name.trim(), active_clinicians: parseInt(clin), buffer_ratio: (parseFloat(buf) || 0) / 100,
          })}>
          Save
        </button>
      </div>

      <div className="hq-group-title" style={{ marginLeft: 0 }}>Visit types</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              <th style={S.th}>Visit type</th>
              <th style={S.th}>Default (min)</th>
              <th style={S.th}>Recent average</th>
              <th style={S.th}>Default type</th>
              <th style={S.th}>Active</th>
              <th style={S.th} />
            </tr>
          </thead>
          <tbody>
            {types.map((vt) => <VisitTypeRow key={vt.id} vt={vt} onSave={onSaveVt} busy={busy} />)}
          </tbody>
        </table>
      </div>
      <AddVisitType spId={sp.id} onAdd={onAddVt} busy={busy} />
    </section>
  );
}

function VisitTypeRow({ vt, onSave, busy }) {
  const [name, setName] = useState(vt.name);
  const [mins, setMins] = useState(String(vt.default_minutes));
  const changed = name.trim() !== vt.name || mins !== String(vt.default_minutes);
  const learning = vt.recent_count >= 3;
  return (
    <tr style={vt.is_active ? undefined : { opacity: 0.5 }}>
      <td style={S.td}><input className="hq-input" style={{ minHeight: 38, padding: '6px 10px' }} value={name}
        aria-label="Visit type name" onChange={(e) => setName(e.target.value)} /></td>
      <td style={S.td}><input className="hq-input hq-num" style={{ ...S.num, minHeight: 38, padding: '6px 10px' }} type="number"
        min="1" max="120" step="0.5" value={mins} aria-label="Default minutes" onChange={(e) => setMins(e.target.value)} /></td>
      <td style={S.td}>
        <span className="hq-num">{vt.recent_count > 0 ? `${vt.recent_avg} min` : '–'}</span>
        <div className="hq-caption">{vt.recent_count} recent, {learning ? 'estimate learns from visits' : 'estimate uses default'}</div>
      </td>
      <td style={S.td}>
        <input type="radio" checked={vt.is_default} aria-label="Default visit type"
          disabled={busy || !vt.is_active || vt.is_default} onChange={() => onSave(vt.id, { is_default: true })} />
      </td>
      <td style={S.td}>
        <input type="checkbox" checked={vt.is_active} aria-label="Active" disabled={busy || vt.is_default}
          onChange={(e) => onSave(vt.id, { is_active: e.target.checked })} />
      </td>
      <td style={S.td}>
        <button type="button" className="hq-btn hq-btn-secondary" style={S.small} disabled={!changed || busy}
          onClick={() => onSave(vt.id, { name: name.trim(), default_minutes: parseFloat(mins) })}>Save</button>
      </td>
    </tr>
  );
}

function AddVisitType({ spId, onAdd, busy }) {
  const [name, setName] = useState('');
  const [mins, setMins] = useState('10');
  return (
    <div style={{ ...S.inline, marginTop: 14 }}>
      <div className="hq-field" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
        <label htmlFor={`nvt-${spId}`}>Add a visit type</label>
        <input id={`nvt-${spId}`} className="hq-input" value={name} placeholder="For example Family planning"
          onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="hq-field" style={{ marginBottom: 0 }}>
        <label htmlFor={`nvm-${spId}`}>Default (min)</label>
        <input id={`nvm-${spId}`} className="hq-input hq-num" style={S.num} type="number" min="1" max="120"
          value={mins} onChange={(e) => setMins(e.target.value)} />
      </div>
      <button type="button" className="hq-btn hq-btn-secondary" style={{ minHeight: 44 }}
        disabled={busy || name.trim().length < 2}
        onClick={async () => {
          if (await onAdd({ service_point_id: spId, name: name.trim(), default_minutes: parseFloat(mins) })) setName('');
        }}>
        Add visit type
      </button>
    </div>
  );
}

function AddServicePoint({ onAdd, busy }) {
  const empty = { name: '', code: '', default_visit_type: 'General', default_minutes: '10', active_clinicians: '1' };
  const [f, setF] = useState(empty);
  const set = (k) => (e) => setF({ ...f, [k]: k === 'code' ? e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) : e.target.value });
  return (
    <section className="hq-panel" style={{ marginBottom: 20 }}>
      <h3 className="hq-headline" style={{ marginBottom: 4 }}>Add a service point</h3>
      <p className="hq-footnote" style={{ margin: '0 0 14px' }}>
        A new department appears at reception, for clinicians and on the public display straight away.
        The token prefix starts every token number, such as LAB-001, and cannot be changed later.
      </p>
      <div style={S.grid3}>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor="nsp-name">Name</label>
          <input id="nsp-name" className="hq-input" value={f.name} placeholder="For example Laboratory" onChange={set('name')} />
        </div>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor="nsp-code">Token prefix (2 to 5 letters)</label>
          <input id="nsp-code" className="hq-input" value={f.code} placeholder="LAB" onChange={set('code')} />
        </div>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor="nsp-clin">Active clinicians</label>
          <input id="nsp-clin" className="hq-input hq-num" type="number" min="1" max="10" value={f.active_clinicians} onChange={set('active_clinicians')} />
        </div>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor="nsp-vt">First visit type</label>
          <input id="nsp-vt" className="hq-input" value={f.default_visit_type} onChange={set('default_visit_type')} />
        </div>
        <div className="hq-field" style={{ marginBottom: 0 }}>
          <label htmlFor="nsp-min">Its default time (min)</label>
          <input id="nsp-min" className="hq-input hq-num" type="number" min="1" max="120" value={f.default_minutes} onChange={set('default_minutes')} />
        </div>
        <button type="button" className="hq-btn hq-btn-primary" style={{ minHeight: 44 }}
          disabled={busy || f.name.trim().length < 2 || f.code.length < 2}
          onClick={async () => {
            const ok = await onAdd({
              name: f.name.trim(), code: f.code, default_visit_type: f.default_visit_type.trim(),
              default_minutes: parseFloat(f.default_minutes), active_clinicians: parseInt(f.active_clinicians),
            });
            if (ok) setF(empty);
          }}>
          Add service point
        </button>
      </div>
    </section>
  );
}

/* ====================== Staff ====================== */

function StaffForm({ initial, servicePoints, canMakeAdmin, isNew, isSelf, onSubmit, onCancel, busy }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (f.full_name.trim().length < 2) return setErr('Enter the full name.');
    if (isNew && !/^[a-z0-9._]{3,30}$/.test(f.username)) return setErr('Username: 3 to 30 lower-case letters, numbers, dots or underscores.');
    if (f.role === 'clinician' && !f.service_point_id) return setErr('Choose the service point this clinician works at.');
    if (isNew) {
      const p = pwProblem(f.password, f.username);
      if (p) return setErr(p);
    }
    setErr('');
    const result = await onSubmit(f);
    if (result !== true) setErr(result);
  };
  return (
    <form onSubmit={submit}>
      {err && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="hq-field">
        <label htmlFor="sf-name">Full name</label>
        <input id="sf-name" className="hq-input" value={f.full_name} onChange={set('full_name')} autoFocus />
      </div>
      {isNew && (
        <div className="hq-field">
          <label htmlFor="sf-user">Username</label>
          <input id="sf-user" className="hq-input" value={f.username} autoComplete="off" autoCapitalize="none"
            onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} />
        </div>
      )}
      <div className="hq-field">
        <label htmlFor="sf-role">Role</label>
        <select id="sf-role" className="hq-select" value={f.role} onChange={set('role')} disabled={isSelf}>
          <option value="receptionist">Receptionist</option>
          <option value="clinician">Clinician</option>
          <option value="manager">Clinic manager</option>
          {(canMakeAdmin || f.role === 'admin') && <option value="admin">Administrator</option>}
        </select>
        {isSelf && <span className="hq-caption">You cannot change your own role.</span>}
      </div>
      {f.role === 'clinician' && (
        <div className="hq-field">
          <label htmlFor="sf-sp">Works at</label>
          <select id="sf-sp" className="hq-select" value={f.service_point_id || ''} onChange={set('service_point_id')}>
            <option value="">Choose a service point</option>
            {servicePoints.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      {isNew && (
        <div className="hq-field">
          <label htmlFor="sf-pw">Starting password</label>
          <input id="sf-pw" className="hq-input" type="text" autoComplete="off" value={f.password} onChange={set('password')} />
          <span className="hq-caption">At least 8 characters with letters and numbers. Ask them to change it after signing in.</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
        <button type="button" className="hq-btn hq-btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button type="submit" className="hq-btn hq-btn-primary" style={{ flex: 1 }} disabled={busy}>
          {isNew ? 'Add staff member' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function ResetPassword({ person, onSubmit, onCancel, busy }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const p = pwProblem(pw, person.username);
      if (p) return setErr(p);
      const r = await onSubmit(pw);
      if (r !== true) setErr(r);
    }}>
      <p className="hq-footnote" style={{ margin: '0 0 14px' }}>
        Set a new password for {person.full_name} ({person.username}). Tell them in person, and ask them to change it after signing in.
      </p>
      {err && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="hq-field">
        <label htmlFor="rp-pw">New password</label>
        <input id="rp-pw" className="hq-input" type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="hq-btn hq-btn-secondary" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button type="submit" className="hq-btn hq-btn-primary" style={{ flex: 1 }} disabled={busy}>Set password</button>
      </div>
    </form>
  );
}

function StaffTab({ staff, servicePoints, me, busy, save }) {
  const [modal, setModal] = useState(null); // { kind: 'add' | 'edit' | 'password', person }
  const [filter, setFilter] = useState('active');
  const canMakeAdmin = me.role === 'admin';
  const shown = staff.filter((s) => (filter === 'all' ? true : filter === 'active' ? s.is_active : !s.is_active));
  const close = () => setModal(null);

  const submitStaff = async (f) => {
    const body = { full_name: f.full_name.trim(), role: f.role, service_point_id: f.role === 'clinician' ? parseInt(f.service_point_id) : null };
    const r = modal.kind === 'add'
      ? await save(() => api.post('/admin/staff', { ...body, username: f.username, password: f.password }), `Added ${body.full_name}.`)
      : await save(() => api.put(`/admin/staff/${modal.person.id}`, body), `Saved ${body.full_name}.`);
    if (r === true) close();
    return r;
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="hq-segmented" role="tablist" aria-label="Show">
          {[['active', 'Active'], ['inactive', 'Deactivated'], ['all', 'All']].map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? 'is-active' : undefined} onClick={() => setFilter(k)}
              style={{ minWidth: 100 }}>{label}</button>
          ))}
        </div>
        <button type="button" className="hq-btn hq-btn-primary" style={{ marginLeft: 'auto' }}
          onClick={() => setModal({ kind: 'add' })}>
          Add staff member
        </button>
      </div>

      <div className="hq-group">
        {shown.length === 0 && <div className="hq-empty">No staff in this list.</div>}
        {shown.map((s) => {
          const locked = s.role === 'admin' && me.role !== 'admin';
          const self = s.id === me.id;
          return (
            <div key={s.id} className="hq-row" style={{ opacity: s.is_active ? 1 : 0.6, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 220, flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{s.full_name}{self && <span className="hq-caption"> (you)</span>}</div>
                <div className="hq-caption">
                  {s.username}{s.service_point ? `, ${s.service_point}` : ''}{!s.is_active ? ', deactivated' : ''}
                </div>
              </div>
              <span className={`hq-pill ${ROLE_PILL[s.role]}`}>{ROLE_NAMES[s.role]}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="hq-btn hq-btn-secondary" style={S.small} disabled={busy || locked}
                  onClick={() => setModal({ kind: 'edit', person: s })}>Edit</button>
                <button type="button" className="hq-btn hq-btn-secondary" style={S.small} disabled={busy || locked}
                  onClick={() => setModal({ kind: 'password', person: s })}>Reset password</button>
                <button type="button" className={`hq-btn ${s.is_active ? 'hq-btn-destructive' : 'hq-btn-secondary'}`} style={S.small}
                  disabled={busy || locked || self}
                  title={self ? 'You cannot deactivate your own account' : locked ? 'Only an administrator can change this account' : undefined}
                  onClick={() => {
                    if (!s.is_active || window.confirm(`Deactivate ${s.full_name}? They will no longer be able to sign in. Their history is kept.`)) {
                      save(() => api.put(`/admin/staff/${s.id}`, { is_active: !s.is_active }),
                        `${s.full_name} ${s.is_active ? 'deactivated' : 'activated'}.`);
                    }
                  }}>
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="hq-caption" style={{ margin: '10px 4px 0' }}>
        Accounts are deactivated, never deleted, because every recorded event names the staff member who did it.
        Only an administrator can create or change administrator accounts.
      </p>

      {modal?.kind === 'add' && (
        <Modal title="Add staff member" onClose={close}>
          <StaffForm isNew canMakeAdmin={canMakeAdmin} servicePoints={servicePoints} busy={busy}
            initial={{ full_name: '', username: '', role: 'receptionist', service_point_id: '', password: '' }}
            onSubmit={submitStaff} onCancel={close} />
        </Modal>
      )}
      {modal?.kind === 'edit' && (
        <Modal title={`Edit ${modal.person.full_name}`} onClose={close}>
          <StaffForm canMakeAdmin={canMakeAdmin} servicePoints={servicePoints} busy={busy} isSelf={modal.person.id === me.id}
            initial={{ full_name: modal.person.full_name, role: modal.person.role, service_point_id: modal.person.service_point_id ? String(modal.person.service_point_id) : '' }}
            onSubmit={submitStaff} onCancel={close} />
        </Modal>
      )}
      {modal?.kind === 'password' && (
        <Modal title="Reset password" onClose={close}>
          <ResetPassword person={modal.person} busy={busy} onCancel={close}
            onSubmit={async (pw) => {
              const r = await save(() => api.post(`/admin/staff/${modal.person.id}/password`, { new_password: pw }),
                `New password set for ${modal.person.full_name}.`);
              if (r === true) close();
              return r;
            }} />
        </Modal>
      )}
    </>
  );
}

/* ====================== Page ====================== */

export default function Settings() {
  const me = JSON.parse(sessionStorage.getItem('staff') || '{}');
  const [tab, setTab] = useState('points');
  const [config, setConfig] = useState(null);
  const [staff, setStaff] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // remounts forms after a save

  const load = useCallback(() => {
    api.get('/admin/config')
      .then((res) => { setConfig(res.data); setVersion((v) => v + 1); })
      .catch((err) => setError(err.response?.data?.error || 'Could not load settings.'));
    api.get('/admin/staff').then((res) => setStaff(res.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  // Returns true on success, or the error message
  const save = async (request, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request();
      setNotice(message);
      load();
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not save.';
      setError(msg);
      return msg;
    } finally {
      setBusy(false);
    }
  };

  const saveSp = (id, body) => save(() => api.put(`/admin/service-points/${id}`, body), 'Service point saved.');
  const addSp = async (body) => (await save(() => api.post('/admin/service-points', body), `Added ${body.name}.`)) === true;
  const saveVt = (id, body) => save(() => api.put(`/admin/visit-types/${id}`, body), 'Visit type saved.');
  const addVt = async (body) => (await save(() => api.post('/admin/visit-types', body), `Added "${body.name}".`)) === true;

  return (
    <div>
      <TopBar subtitle="Settings" />
      <main className="hq-page">
        <div className="hq-page-header">
          <div>
            <h1 className="hq-large-title">Settings</h1>
            <p className="hq-footnote" style={{ margin: '6px 0 0' }}>Departments, waiting-time settings and staff accounts. Every change is recorded.</p>
          </div>
          <div className="hq-segmented" role="tablist" aria-label="Settings sections">
            {[['points', 'Service points'], ['staff', 'Staff'], ['log', 'Change log']].map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : undefined}
                onClick={() => { setTab(k); setError(''); setNotice(''); }}>{label}</button>
            ))}
          </div>
        </div>

        {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}
        {notice && <div className="hq-notice is-success" role="status" style={{ marginBottom: 16 }}>{notice}</div>}
        {!config && !error && <div className="hq-empty">Loading settings…</div>}

        {config && tab === 'points' && (
          <>
            <p className="hq-footnote" style={{ margin: '0 4px 16px' }}>
              Default times are used for a visit type until it has 3 recent valid consultations (1 to 60 minutes, last 30 days);
              after that the estimate learns from those visits. Changes apply to new estimates straight away.
            </p>
            <AddServicePoint key={`add-${version}`} onAdd={addSp} busy={busy} />
            {config.service_points.map((sp) => (
              <ServicePointPanel key={`${sp.id}-${version}`} sp={sp}
                types={config.visit_types.filter((vt) => vt.service_point_id === sp.id)}
                onSaveSp={saveSp} onSaveVt={saveVt} onAddVt={addVt} busy={busy} />
            ))}
          </>
        )}

        {config && tab === 'staff' && (
          <StaffTab staff={staff} servicePoints={config.service_points} me={me} busy={busy} save={save} />
        )}

        {config && tab === 'log' && (
          <div className="hq-group">
            {config.recent_changes.length === 0 ? (
              <div className="hq-empty">No changes yet.</div>
            ) : config.recent_changes.map((c, i) => (
              <div key={i} className="hq-row" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div>
                    <span className="hq-caption">{ENTITY_NAMES[c.entity] || c.entity}</span>{' '}
                    <strong>{c.entity_name}</strong>: {FIELD_LABELS[c.field] || c.field}{' '}
                    {c.field === 'created' ? `(${c.new_value})`
                      : c.field === 'password' ? 'reset'
                        : `${c.old_value ?? '–'} → ${c.new_value ?? '–'}`}
                  </div>
                  <div className="hq-caption">{c.changed_by || 'unknown'}</div>
                </div>
                <span className="hq-footnote hq-num" style={{ whiteSpace: 'nowrap' }}>{when(c.changed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
