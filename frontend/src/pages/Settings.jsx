import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';

const S = {
  page: {
    minHeight: '100vh', backgroundColor: '#F2F2F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  body: { maxWidth: 1000, margin: '0 auto', padding: '28px 20px 60px' },
  h1: { fontSize: 24, fontWeight: 700, color: '#1C1C1E', margin: '0 0 6px' },
  intro: { fontSize: 14, color: '#3C3C43', margin: '0 0 20px', lineHeight: 1.5 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 22, marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  spHead: { display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 14 },
  spName: { fontSize: 18, fontWeight: 700, color: '#1C1C1E', flex: 1, minWidth: 180 },
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#3C3C43' },
  input: {
    padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 14,
    backgroundColor: '#FAFAFA', width: 90,
  },
  wide: { width: '100%', minWidth: 160, boxSizing: 'border-box' },
  save: {
    padding: '8px 14px', backgroundColor: '#007AFF', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  saveOff: { backgroundColor: '#C7C7CC', cursor: 'default' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 6px', color: '#8E8E93', fontSize: 11,
    textTransform: 'uppercase', borderBottom: '1px solid #E5E5EA',
  },
  td: { padding: '8px 6px', borderBottom: '1px solid #F2F2F7', verticalAlign: 'middle' },
  muted: { fontSize: 12, color: '#8E8E93' },
  error: {
    color: '#FF3B30', fontSize: 14, backgroundColor: '#FFF2F2',
    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
  },
  ok: {
    color: '#1A7A5E', fontSize: 14, backgroundColor: '#E8F8F2',
    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
  },
  addRow: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 14 },
  logRow: { fontSize: 13, color: '#3C3C43', padding: '6px 0', borderBottom: '1px solid #F2F2F7' },
};

const FIELD_LABELS = {
  default_minutes: 'default time (min)',
  active_clinicians: 'active clinicians',
  buffer_ratio: 'buffer',
  is_default: 'default visit type',
  is_active: 'active',
  name: 'name',
  created: 'added',
};

const when = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });

function ServicePointSettings({ sp, onSave, busy }) {
  const [clin, setClin] = useState(String(sp.active_clinicians));
  const [buf, setBuf] = useState(String(Math.round(sp.buffer_ratio * 100)));
  const changed = clin !== String(sp.active_clinicians) || buf !== String(Math.round(sp.buffer_ratio * 100));
  return (
    <div style={S.spHead}>
      <div style={S.spName}>{sp.name} <span style={S.muted}>({sp.code})</span></div>
      <label style={S.field}>Active clinicians
        <input type="number" min="1" max="10" style={S.input} value={clin}
          onChange={(e) => setClin(e.target.value)} />
      </label>
      <label style={S.field}>Safety buffer (%)
        <input type="number" min="0" max="50" style={S.input} value={buf}
          onChange={(e) => setBuf(e.target.value)} />
      </label>
      <button style={changed ? S.save : { ...S.save, ...S.saveOff }} disabled={!changed || busy}
        onClick={() => onSave(sp.id, {
          active_clinicians: parseInt(clin), buffer_ratio: (parseFloat(buf) || 0) / 100,
        })}>
        Save
      </button>
    </div>
  );
}

function VisitTypeRow({ vt, onSave, busy }) {
  const [name, setName] = useState(vt.name);
  const [mins, setMins] = useState(String(vt.default_minutes));
  const changed = name.trim() !== vt.name || mins !== String(vt.default_minutes);
  const learning = vt.recent_count >= 3;
  return (
    <tr style={vt.is_active ? undefined : { opacity: 0.5 }}>
      <td style={S.td}>
        <input style={{ ...S.input, ...S.wide }} value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td style={S.td}>
        <input type="number" min="1" max="120" step="0.5" style={S.input} value={mins}
          onChange={(e) => setMins(e.target.value)} />
      </td>
      <td style={S.td}>
        {vt.recent_count > 0 ? `${vt.recent_avg} min` : '—'}
        <div style={S.muted}>
          {vt.recent_count} recent · {learning ? 'estimate uses recent visits' : 'estimate uses default'}
        </div>
      </td>
      <td style={S.td}>
        <input type="radio" checked={vt.is_default} disabled={busy || !vt.is_active || vt.is_default}
          onChange={() => onSave(vt.id, { is_default: true })} />
      </td>
      <td style={S.td}>
        <input type="checkbox" checked={vt.is_active} disabled={busy || vt.is_default}
          onChange={(e) => onSave(vt.id, { is_active: e.target.checked })} />
      </td>
      <td style={S.td}>
        <button style={changed ? S.save : { ...S.save, ...S.saveOff }} disabled={!changed || busy}
          onClick={() => onSave(vt.id, { name: name.trim(), default_minutes: parseFloat(mins) })}>
          Save
        </button>
      </td>
    </tr>
  );
}

function AddVisitType({ spId, onAdd, busy }) {
  const [name, setName] = useState('');
  const [mins, setMins] = useState('10');
  return (
    <div style={S.addRow}>
      <label style={{ ...S.field, flex: 1 }}>New visit type
        <input style={{ ...S.input, ...S.wide }} value={name} placeholder="e.g. Family planning"
          onChange={(e) => setName(e.target.value)} />
      </label>
      <label style={S.field}>Default (min)
        <input type="number" min="1" max="120" style={S.input} value={mins}
          onChange={(e) => setMins(e.target.value)} />
      </label>
      <button style={name.trim().length >= 2 ? S.save : { ...S.save, ...S.saveOff }}
        disabled={busy || name.trim().length < 2}
        onClick={async () => {
          const ok = await onAdd({ service_point_id: spId, name: name.trim(), default_minutes: parseFloat(mins) });
          if (ok) setName('');
        }}>
        Add
      </button>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // remounts rows after a save

  const load = useCallback(() => {
    api.get('/admin/config')
      .then((res) => { setConfig(res.data); setVersion((v) => v + 1); })
      .catch((err) => setError(err.response?.data?.error || 'Could not load settings.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (request, message) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await request();
      setNotice(message);
      load();
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveSp = (id, body) => run(() => api.put(`/admin/service-points/${id}`, body), 'Service point saved.');
  const saveVt = (id, body) => run(() => api.put(`/admin/visit-types/${id}`, body), 'Visit type saved.');
  const addVt = (body) => run(() => api.post('/admin/visit-types', body), `Added "${body.name}".`);

  return (
    <div style={S.page}>
      <TopBar subtitle="Settings" />
      <div style={S.body}>
        <h1 style={S.h1}>Waiting-time settings</h1>
        <p style={S.intro}>
          Default times are used for a visit type until it has 3 recent valid consultations
          (1 to 60 minutes, last 30 days); after that the estimate learns from those visits.
          Changes apply to new estimates straight away and are recorded below.
        </p>
        {error && <div style={S.error}>{error}</div>}
        {notice && <div style={S.ok}>{notice}</div>}
        {!config && !error && <div style={S.muted}>Loading settings...</div>}

        {config && config.service_points.map((sp) => (
          <div key={`${sp.id}-${version}`} style={S.card}>
            <ServicePointSettings sp={sp} onSave={saveSp} busy={busy} />
            <table style={S.table}>
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
                {config.visit_types.filter((vt) => vt.service_point_id === sp.id).map((vt) => (
                  <VisitTypeRow key={vt.id} vt={vt} onSave={saveVt} busy={busy} />
                ))}
              </tbody>
            </table>
            <AddVisitType spId={sp.id} onAdd={addVt} busy={busy} />
          </div>
        ))}

        {config && (
          <div style={S.card}>
            <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Recent changes</div>
            {config.recent_changes.length === 0 ? (
              <div style={S.muted}>No changes yet.</div>
            ) : config.recent_changes.map((c, i) => (
              <div key={i} style={S.logRow}>
                <strong>{when(c.changed_at)}</strong> · {c.changed_by || 'unknown'} · {c.entity_name}:{' '}
                {FIELD_LABELS[c.field] || c.field}{' '}
                {c.field === 'created'
                  ? `(${c.new_value})`
                  : `${c.old_value ?? '—'} → ${c.new_value ?? '—'}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
