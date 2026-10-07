import { useState, useEffect } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';

const S = {
  page: {
    minHeight: '100vh', backgroundColor: '#F2F2F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  body: {
    maxWidth: 1000, margin: '0 auto', padding: '28px 20px',
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
  tokenLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.75, textTransform: 'uppercase' },
  tokenNum: { fontSize: 48, fontWeight: 700, margin: '4px 0' },
  statRow: { display: 'flex', gap: 12 },
  stat: { flex: 1, backgroundColor: '#F2F2F7', borderRadius: 12, padding: '14px 16px' },
  statNum: { fontSize: 26, fontWeight: 700, color: '#007AFF' },
  statLabel: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  note: { fontSize: 12, color: '#8E8E93', marginTop: 14 },
};

export default function Reception() {
  const [servicePoints, setServicePoints] = useState([]);
  const [form, setForm] = useState({
    full_name: '', phone_number: '', gender: '', service_point_id: '', reason: '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/visits/service-points').then((res) => {
      setServicePoints(res.data);
      if (res.data.length > 0) {
        setForm((f) => ({ ...f, service_point_id: String(res.data[0].id) }));
      }
    }).catch(() => setError('Could not load service points. Is the backend running?'));
  }, []);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (priority) => {
    if (!form.full_name.trim()) {
      setError('Patient full name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/visits', {
        ...form,
        service_point_id: parseInt(form.service_point_id),
        visit_type: 'walk_in',
        priority,
      });
      setResult(res.data);
      setForm({ ...form, full_name: '', phone_number: '', gender: '', reason: '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not register the patient.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <TopBar subtitle="Reception · Register patient" />
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
          {!result ? (
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
                  ? 'default average: not enough completed visits yet'
                  : `rolling average of ${result.ewt.sample_size} recent visits`})
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}