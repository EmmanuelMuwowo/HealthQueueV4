import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';
import ReceptionNav from '../components/ReceptionNav';

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
    boxSizing: 'border-box',
  },
  twoCol: { display: 'flex', gap: 12 },
  primary: {
    width: '100%', padding: 13, backgroundColor: '#007AFF', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  error: {
    color: '#FF3B30', fontSize: 13, backgroundColor: '#FFF2F2',
    padding: '10px 12px', borderRadius: 8, marginBottom: 14,
  },
  notice: {
    color: '#1A7A5E', fontSize: 13, backgroundColor: '#E8F8F2',
    padding: '10px 12px', borderRadius: 8, marginBottom: 14,
  },
  listHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  dateInput: { padding: '8px 12px', borderRadius: 10, border: '1px solid #E5E5EA', fontSize: 14 },
  row: { padding: '14px 0', borderBottom: '1px solid #F2F2F7' },
  rowTop: { display: 'flex', alignItems: 'center', gap: 12 },
  time: { fontSize: 18, fontWeight: 700, color: '#007AFF', minWidth: 60 },
  name: { flex: 1, fontSize: 15, fontWeight: 500, color: '#1C1C1E' },
  sub: { fontSize: 12, color: '#8E8E93', margin: '4px 0 0 72px' },
  pill: (status) => ({
    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    backgroundColor:
      status === 'booked' ? '#E3F2FD' : status === 'checked_in' ? '#E8F8F2' : '#F2F2F7',
    color: status === 'booked' ? '#1565C0' : status === 'checked_in' ? '#1A7A5E' : '#8E8E93',
  }),
  actions: { display: 'flex', gap: 8, margin: '10px 0 0 72px' },
  checkBtn: {
    padding: '7px 14px', backgroundColor: '#34C759', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    padding: '7px 14px', backgroundColor: '#FFF2F2', color: '#FF3B30', border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  empty: { color: '#8E8E93', fontSize: 15, textAlign: 'center', padding: '40px 0' },
  followTag: {
    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    backgroundColor: '#FFF3CD', color: '#856404',
  },
  tokenBox: {
    background: 'linear-gradient(135deg, #34C759 0%, #248A3D 100%)', borderRadius: 14,
    padding: 18, color: '#fff', marginTop: 16,
  },
};

const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });

const statusLabel = (s) => s.replace('_', ' ');
const shortWhen = (iso) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });

export default function Appointments() {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const [servicePoints, setServicePoints] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    full_name: '', phone_number: '', gender: '', service_point_id: '',
    date: today, time: '', reason: '', category_id: '',
  });
  const [listDate, setListDate] = useState(today);
  const [list, setList] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkedIn, setCheckedIn] = useState(null);
  const [busy, setBusy] = useState(false);


   useEffect(() => {
    api.get('/visits/service-points').then((res) => {
      setServicePoints(res.data);
      if (res.data.length > 0) {
        setForm((f) => ({ ...f, service_point_id: String(res.data[0].id) }));
      }
    }).catch(() => setError('Could not load service points.'));
  }, []);

  // Visit types, with an offline copy (not sensitive)
  useEffect(() => {
    api.get('/visits/categories')
      .then((res) => {
        localStorage.setItem('hq-categories', JSON.stringify(res.data));
        setCategories(res.data);
      })
      .catch(() => {
        try { setCategories(JSON.parse(localStorage.getItem('hq-categories') || '[]')); } catch { /* ignore */ }
      });
  }, []);

  const spCategories = categories.filter(
    (c) => String(c.service_point_id) === String(form.service_point_id)
  );

  // When the service point changes, pick its usual visit type
  useEffect(() => {
    if (spCategories.length === 0) return;
    if (!spCategories.some((c) => String(c.id) === String(form.category_id))) {
      const def = spCategories.find((c) => c.is_default) || spCategories[0];
      setForm((f) => ({ ...f, category_id: String(def.id) }));
    }
  }, [form.service_point_id, categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    api.get('/appointments', { params: { date: listDate } })
      .then((res) => setList(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load appointments.'));
  }, [listDate]);

  useEffect(() => { load(); }, [load]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const book = async () => {
    setError(''); setNotice(''); setCheckedIn(null);
    if (!form.full_name.trim() || !form.date || !form.time) {
      setError('Name, date and time are required.');
      return;
    }
    setBusy(true);
    try {
      // Lusaka is UTC+02:00 all year, so the offset is fixed
      await api.post('/appointments', {
        full_name: form.full_name,
        phone_number: form.phone_number,
        gender: form.gender,
        service_point_id: parseInt(form.service_point_id),
        scheduled_at: `${form.date}T${form.time}:00+02:00`,
        reason: form.reason,
        category_id: form.category_id ? parseInt(form.category_id) : undefined,
      });
      setNotice(`Booked ${form.full_name} for ${form.date} at ${form.time}.`);
      setForm({ ...form, full_name: '', phone_number: '', gender: '', reason: '' });
      if (listDate === form.date) load(); else setListDate(form.date);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not book the appointment.');
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async (id) => {
    setError(''); setNotice(''); setBusy(true);
    try {
      const res = await api.post(`/appointments/${id}/check-in`);
      setCheckedIn(res.data);
      load();
    } catch (err) {
      setCheckedIn(null);
      setError(err.response?.data?.error || 'Check-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    setError(''); setNotice(''); setBusy(true);
    try {
      await api.put(`/appointments/${id}/cancel`);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.page}>
      <TopBar subtitle="Reception · Appointments" />
      <ReceptionNav />
      <div style={S.body}>
        <div style={S.card}>
          <h2 style={S.h2}>Book an appointment</h2>
          {error && <div style={S.error}>{error}</div>}
          {notice && <div style={S.notice}>{notice}</div>}

          <label style={S.label}>Full name *</label>
          <input style={S.input} value={form.full_name} onChange={update('full_name')} />

          <label style={S.label}>Phone number</label>
          <input style={S.input} value={form.phone_number} onChange={update('phone_number')} />

          <div style={S.twoCol}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Gender</label>
              <select style={S.input} value={form.gender} onChange={update('gender')}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Service point</label>
              <select style={S.input} value={form.service_point_id} onChange={update('service_point_id')}>
                {servicePoints.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
          </div>

          <label style={S.label}>Visit type</label>
          <select style={S.input} value={form.category_id} onChange={update('category_id')}>
            {spCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div style={S.twoCol}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Date *</label>
              <input type="date" style={S.input} value={form.date} min={today}
                onChange={update('date')} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Time *</label>
              <input type="time" style={S.input} value={form.time} onChange={update('time')} />
            </div>
          </div>

          <label style={S.label}>Reason (optional)</label>
          <input style={S.input} value={form.reason} onChange={update('reason')} />

          <button style={S.primary} disabled={busy} onClick={book}>
            {busy ? 'Working...' : 'Book appointment'}
          </button>
        </div>

        <div style={S.card}>
          <div style={S.listHead}>
            <h2 style={{ ...S.h2, margin: 0 }}>Appointments</h2>
            <input type="date" style={S.dateInput} value={listDate}
              onChange={(e) => setListDate(e.target.value)} />
          </div>

          {list.length === 0 ? (
            <div style={S.empty}>No appointments on this date.</div>
          ) : (
            list.map((a) => (
              <div key={a.id} style={S.row}>
                <div style={S.rowTop}>
                  <div style={S.time}>{timeLabel(a.scheduled_at)}</div>
                  <div style={S.name}>{a.full_name}</div>
                  {a.follow_up_of_visit && <span style={S.followTag}>follow-up</span>}
                  <span style={S.pill(a.status)}>{statusLabel(a.status)}</span>
                </div>
                <div style={S.sub}>
                  {a.service_point_name}{a.category_name ? ` · ${a.category_name}` : ''}
                  {a.phone_number ? ` · ${a.phone_number}` : ''}
                  {a.reason ? ` · ${a.reason}` : ''}
                </div>
                {(a.reminder_1d_at || a.reminder_2h_at) && (
                  <div style={S.sub}>
                    Reminder SMS:
                    {a.reminder_1d_at ? ` day before (${shortWhen(a.reminder_1d_at)})` : ''}
                    {a.reminder_1d_at && a.reminder_2h_at ? ',' : ''}
                    {a.reminder_2h_at ? ` 2 hours before (${shortWhen(a.reminder_2h_at)})` : ''}
                  </div>
                )}
                {a.status === 'booked' && (
                  <div style={S.actions}>
                    {listDate === today && (
                      <button style={S.checkBtn} disabled={busy} onClick={() => checkIn(a.id)}>
                        Check in
                      </button>
                    )}
                    <button style={S.cancelBtn} disabled={busy} onClick={() => cancel(a.id)}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {checkedIn && (
            <div style={S.tokenBox}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.85 }}>
                CHECKED IN · {checkedIn.service_point.toUpperCase()}
              </div>
              <div style={{ fontSize: 40, fontWeight: 700 }}>{checkedIn.token.token_number}</div>
              <div style={{ fontSize: 15 }}>{checkedIn.patient.full_name}</div>
              <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
                {checkedIn.ewt.patients_ahead} ahead ·{' '}
                {checkedIn.ewt.ewt_low != null && checkedIn.ewt.ewt_high != null
                  ? `wait ${checkedIn.ewt.ewt_low}–${checkedIn.ewt.ewt_high} min`
                  : `about ${checkedIn.ewt.ewt_minutes} min`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}