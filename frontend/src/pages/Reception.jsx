import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';
import ReceptionNav from '../components/ReceptionNav';
import { newRef, addPending, getPending, removePending, syncPending } from '../services/offlineQueue';

const S = {
  page: {
    minHeight: '100vh', backgroundColor: '#F2F2F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  body: {
    maxWidth: 1000, margin: '0 auto', padding: '20px 20px 28px',
    display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flex: 1, minWidth: 320,
  },
  h2: { fontSize: 18, fontWeight: 600, color: '#1C1C1E', margin: '0 0 16px' },
  label: { fontSize: 13, fontWeight: 500, color: '#3C3C43', marginBottom: 6, display: 'block' },
  input: {
    width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #E5E5EA',
    fontSize: 15, backgroundColor: '#FAFAFA', outline: 'none', marginBottom: 14,
  },
  row: { display: 'flex', gap: 12, marginTop: 4 },
  primary: {
    flex: 1, padding: 13, backgroundColor: '#007AFF', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  urgent: {
    padding: '13px 20px', backgroundColor: '#FF3B30', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  error: {
    color: '#FF3B30', fontSize: 13, backgroundColor: '#FFF2F2',
    padding: '10px 12px', borderRadius: 8, marginBottom: 14,
  },
  empty: { color: '#8E8E93', fontSize: 15, textAlign: 'center', padding: '60px 0' },
  tokenBox: {
    background: 'linear-gradient(135deg, #007AFF 0%, #0055D4 100%)', borderRadius: 16,
    padding: 24, color: '#fff', marginBottom: 16,
  },
  savedBox: {
    background: 'linear-gradient(135deg, #8E8E93 0%, #636366 100%)', borderRadius: 16,
    padding: 24, color: '#fff', marginBottom: 16,
  },
  tokenLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.8, textTransform: 'uppercase' },
  tokenNum: { fontSize: 48, fontWeight: 700, margin: '4px 0' },
  statRow: { display: 'flex', gap: 12 },
  stat: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 12, padding: '14px 16px' },
  statNum: { fontSize: 26, fontWeight: 700, color: '#007AFF' },
  statLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  note: { fontSize: 12, color: '#8E8E93', marginTop: 14 },
  syncHead: {
    fontSize: 13, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase',
    letterSpacing: 0.5, margin: '24px 0 8px',
  },
  syncRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    borderRadius: 10, backgroundColor: '#F2F2F7', marginBottom: 6, fontSize: 14,
  },
  pill: (status) => ({
    padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    backgroundColor: status === 'failed' ? '#FFE5E5' : status === 'synced' ? '#E8F8F2' : '#FFF3CD',
    color: status === 'failed' ? '#CC0000' : status === 'synced' ? '#1A7A5E' : '#856404',
  }),
  dismiss: {
    padding: '4px 10px', borderRadius: 8, border: 'none', backgroundColor: '#fff',
    color: '#FF3B30', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
};

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });
const shortRef = (ref) => ref.slice(0, 8).toUpperCase();

export default function Reception() {
  const [servicePoints, setServicePoints] = useState([]);
  const [form, setForm] = useState({
    full_name: '', phone_number: '', gender: '', service_point_id: '', reason: '',
  });
  const [result, setResult] = useState(null);
  const [savedOffline, setSavedOffline] = useState(null);
  const [pending, setPending] = useState(getPending());
  const [synced, setSynced] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/visits/service-points').then((res) => {
      setServicePoints(res.data);
      if (res.data.length > 0) {
        setForm((f) => ({ ...f, service_point_id: f.service_point_id || String(res.data[0].id) }));
      }
    }).catch(() => setError('Could not load service points. Is the backend running?'));
  }, []);

  const runSync = useCallback(async () => {
    const done = await syncPending();
    if (done.length > 0) setSynced((s) => [...done, ...s].slice(0, 5));
  }, []);

  // Sync now, when the connection returns, and every 10 seconds while anything is pending
  useEffect(() => {
    const refresh = () => setPending(getPending());
    window.addEventListener('hq-pending-changed', refresh);
    window.addEventListener('online', runSync);
    window.addEventListener('hq-online', runSync);
    runSync();
    const timer = setInterval(() => {
      if (getPending().some((i) => i.status === 'pending')) runSync();
    }, 10000);
    return () => {
      window.removeEventListener('hq-pending-changed', refresh);
      window.removeEventListener('online', runSync);
      window.removeEventListener('hq-online', runSync);
      clearInterval(timer);
    };
  }, [runSync]);

    // When the patient on the grey card syncs, show their real token instead
  useEffect(() => {
    if (!savedOffline) return;
    const match = synced.find((r) => r.visit.client_ref === savedOffline.client_ref);
    if (match) {
      setResult(match);
      setSavedOffline(null);
    }
  }, [synced, savedOffline]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const clearForm = () => setForm({ ...form, full_name: '', phone_number: '', gender: '', reason: '' });

  const submit = async (priority) => {
    if (!form.full_name.trim()) {
      setError('Patient full name is required.');
      return;
    }
    setLoading(true);
    setError('');
    setSavedOffline(null);

    const sp = servicePoints.find((s) => String(s.id) === String(form.service_point_id));
    const body = {
      full_name: form.full_name,
      phone_number: form.phone_number,
      gender: form.gender,
      reason: form.reason,
      service_point_id: parseInt(form.service_point_id),
      priority,
      client_ref: newRef(),                 // lets the server ignore a repeat
      captured_at: new Date().toISOString(), // the real arrival time
    };

    try {
      const res = await api.post('/visits', body);
      setResult(res.data);
      clearForm();
    } catch (err) {
      setResult(null);
      if (!err.response) {
        // No reply from the server: keep it on this device and sync later
        const item = { ...body, service_point_name: sp?.name || 'Unknown service point' };
        addPending(item);
        setSavedOffline(item);
        clearForm();
      } else {
        setError(err.response.data?.error || 'Could not register the patient.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <TopBar subtitle="Reception · Register patient" />
      <ReceptionNav />
      <div style={S.body}>
        <div style={S.card}>
          <h2 style={S.h2}>Register walk-in patient</h2>
          {error && <div style={S.error}>{error}</div>}

          <label style={S.label}>Full name *</label>
          <input style={S.input} value={form.full_name} onChange={update('full_name')} />

          <label style={S.label}>Phone number</label>
          <input style={S.input} value={form.phone_number} onChange={update('phone_number')} />

          <label style={S.label}>Gender</label>
          <select style={S.input} value={form.gender} onChange={update('gender')}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>

          <label style={S.label}>Service point</label>
          <select style={S.input} value={form.service_point_id} onChange={update('service_point_id')}>
            {servicePoints.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>

          <label style={S.label}>Reason for visit (optional)</label>
          <input style={S.input} value={form.reason} onChange={update('reason')} />

          <div style={S.row}>
            <button style={S.primary} disabled={loading} onClick={() => submit('normal')}>
              {loading ? 'Registering...' : 'Create visit & token'}
            </button>
            <button style={S.urgent} disabled={loading} onClick={() => submit('urgent')}>
              Urgent
            </button>
          </div>
        </div>

        <div style={S.card}>
          <h2 style={S.h2}>Token issued</h2>

          {savedOffline ? (
            <div style={S.savedBox}>
              <div style={S.tokenLabel}>Saved on this device · pending sync</div>
              <div style={{ fontSize: 34, fontWeight: 700, margin: '6px 0' }}>
                Ref {shortRef(savedOffline.client_ref)}
              </div>
              <div style={{ fontSize: 16 }}>{savedOffline.full_name}</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
                {savedOffline.service_point_name} · registered {clock(savedOffline.captured_at)}.
                The token number is issued when the connection returns.
              </div>
            </div>
          ) : !result ? (
            <div style={S.empty}>Register a patient to generate a token.</div>
          ) : (
            <>
              <div style={S.tokenBox}>
                <div style={S.tokenLabel}>{result.service_point} · {result.token.status}</div>
                <div style={S.tokenNum}>{result.token.token_number}</div>
                <div style={{ fontSize: 16 }}>{result.patient.full_name}</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {result.patient.phone_number || 'No phone number'}
                  {result.token.priority === 'urgent' ? ' · URGENT' : ''}
                </div>
              </div>
              <div style={S.statRow}>
                <div style={S.stat}>
                  <div style={S.statNum}>{result.ewt.patients_ahead}</div>
                  <div style={S.statLabel}>patients ahead</div>
                </div>
                <div style={S.stat}>
                  <div style={S.statNum}>{result.ewt.ewt_minutes} min</div>
                  <div style={S.statLabel}>estimated wait</div>
                </div>
              </div>
              <div style={S.note}>
                EWT = {result.ewt.patients_ahead} patients ahead × {result.ewt.avg_service_minutes} min
                ({result.ewt.avg_source === 'default'
                  ? 'default average: fewer than 3 consultations completed today'
                  : `rolling average of ${result.ewt.sample_size} recent visits`})
              </div>
            </>
          )}

          {pending.length > 0 && (
            <>
              <div style={S.syncHead}>Waiting to sync ({pending.length})</div>
              {pending.map((p) => (
                <div key={p.client_ref} style={S.syncRow}>
                  <strong>{shortRef(p.client_ref)}</strong>
                  <span style={{ flex: 1 }}>{p.full_name} · {p.service_point_name} · {clock(p.captured_at)}</span>
                  <span style={S.pill(p.status)}>{p.status === 'failed' ? 'failed' : 'pending'}</span>
                  {p.status === 'failed' && (
                    <button style={S.dismiss} onClick={() => removePending(p.client_ref)}>Dismiss</button>
                  )}
                </div>
              ))}
              {pending.filter((p) => p.status === 'failed').map((p) => (
                <div key={`${p.client_ref}-err`} style={{ ...S.error, marginTop: 4 }}>
                  {shortRef(p.client_ref)}: {p.error}
                </div>
              ))}
            </>
          )}

          {synced.length > 0 && (
            <>
              <div style={S.syncHead}>Recently synced</div>
              {synced.map((r) => (
                <div key={r.visit.id} style={S.syncRow}>
                  <strong>{r.token.token_number}</strong>
                  <span style={{ flex: 1 }}>{r.patient.full_name} · {r.service_point}</span>
                  <span style={S.pill('synced')}>synced</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}