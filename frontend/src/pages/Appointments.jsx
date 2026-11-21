import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';
import ReceptionNav from '../components/ReceptionNav';
import TokenSlip, { printSlip } from '../components/TokenSlip';

const S = {
  twoUp: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  listHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 },
  time: { fontSize: 17, fontWeight: 700, color: 'var(--hq-blue)', width: 56, flex: 'none' },
  item: { alignItems: 'flex-start', paddingTop: 14, paddingBottom: 14 },
  actions: { display: 'flex', gap: 8, marginTop: 10 },
  small: { minHeight: 34, padding: '6px 14px', fontSize: 14 },
  checkedCard: { background: '#248A3D', color: '#fff', borderRadius: 'var(--hq-r-hero)', padding: '20px 24px', marginTop: 16 },
};

const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });

const statusLabel = (s) => { const t = s.replace('_', ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const statusClass = (s) => (s === 'booked' ? 'is-blue' : s === 'checked_in' ? 'is-green' : '');
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
    <div>
      <TopBar subtitle="Reception" />
      <ReceptionNav />
      <main className="hq-page hq-columns" style={{ paddingTop: 20 }}>
        <section className="hq-panel" aria-labelledby="book-title">
          <h2 id="book-title" className="hq-title" style={{ marginBottom: 16 }}>Book an appointment</h2>
          {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
          {notice && <div className="hq-notice is-success" role="status" style={{ marginBottom: 14 }}>{notice}</div>}

          <div className="hq-field">
            <label htmlFor="a_name">Full name</label>
            <input id="a_name" className="hq-input" value={form.full_name} onChange={update('full_name')} autoComplete="off" />
          </div>
          <div style={S.twoUp}>
            <div className="hq-field">
              <label htmlFor="a_phone">Phone number (optional)</label>
              <input id="a_phone" className="hq-input hq-num" inputMode="tel" placeholder="0977123456"
                value={form.phone_number} onChange={update('phone_number')} autoComplete="off" />
            </div>
            <div className="hq-field">
              <label htmlFor="a_gender">Gender</label>
              <select id="a_gender" className="hq-select" value={form.gender} onChange={update('gender')}>
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div style={S.twoUp}>
            <div className="hq-field">
              <label htmlFor="a_sp">Service point</label>
              <select id="a_sp" className="hq-select" value={form.service_point_id} onChange={update('service_point_id')}>
                {servicePoints.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
            <div className="hq-field">
              <label htmlFor="a_cat">Visit type</label>
              <select id="a_cat" className="hq-select" value={form.category_id} onChange={update('category_id')}>
                {spCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={S.twoUp}>
            <div className="hq-field">
              <label htmlFor="a_date">Date</label>
              <input id="a_date" type="date" className="hq-input" value={form.date} min={today} onChange={update('date')} />
            </div>
            <div className="hq-field">
              <label htmlFor="a_time">Time</label>
              <input id="a_time" type="time" className="hq-input" value={form.time} onChange={update('time')} />
            </div>
          </div>
          <div className="hq-field">
            <label htmlFor="a_reason">Reason (optional)</label>
            <input id="a_reason" className="hq-input" value={form.reason} onChange={update('reason')} />
          </div>

          <button type="button" className="hq-btn hq-btn-primary" style={{ width: '100%', minHeight: 48 }}
            disabled={busy} onClick={book}>
            {busy ? 'Booking…' : 'Book appointment'}
          </button>
        </section>

        <section className="hq-panel" aria-labelledby="list-title">
          <div style={S.listHead}>
            <h2 id="list-title" className="hq-title">Appointments</h2>
            <input type="date" className="hq-input" style={{ width: 'auto', minHeight: 38, padding: '6px 10px' }}
              aria-label="Show appointments for date" value={listDate}
              onChange={(e) => setListDate(e.target.value)} />
          </div>

          {list.length === 0 ? (
            <div className="hq-empty">No appointments on this date. Book one on the left.</div>
          ) : (
            <div className="hq-group">
              {list.map((a) => (
                <div key={a.id} className="hq-row" style={S.item}>
                  <div className="hq-num" style={S.time}>{timeLabel(a.scheduled_at)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{a.full_name}</span>
                      {a.follow_up_of_visit && <span className="hq-pill is-orange">Follow-up</span>}
                    </div>
                    <div className="hq-caption">
                      {a.service_point_name}{a.category_name ? `, ${a.category_name}` : ''}
                      {a.phone_number ? `, ${a.phone_number}` : ''}
                      {a.reason ? `. ${a.reason}` : ''}
                    </div>
                    {(a.reminder_1d_at || a.reminder_2h_at) && (
                      <div className="hq-caption">
                        Reminder SMS
                        {a.reminder_1d_at ? ` day before (${shortWhen(a.reminder_1d_at)})` : ''}
                        {a.reminder_1d_at && a.reminder_2h_at ? ',' : ''}
                        {a.reminder_2h_at ? ` 2 hours before (${shortWhen(a.reminder_2h_at)})` : ''}
                      </div>
                    )}
                    {a.status === 'booked' && (
                      <div style={S.actions}>
                        {listDate === today && (
                          <button type="button" className="hq-btn hq-btn-primary" style={S.small}
                            disabled={busy} onClick={() => checkIn(a.id)}>Check in</button>
                        )}
                        <button type="button" className="hq-btn hq-btn-destructive" style={S.small}
                          disabled={busy} onClick={() => cancel(a.id)}>Cancel</button>
                      </div>
                    )}
                  </div>
                  <span className={`hq-pill ${statusClass(a.status)}`}>{statusLabel(a.status)}</span>
                </div>
              ))}
            </div>
          )}

          {checkedIn && (
            <div style={S.checkedCard} aria-live="polite">
              <div style={{ fontSize: 14, opacity: 0.9 }}>Checked in to {checkedIn.service_point}</div>
              <div className="hq-token" style={{ fontSize: 48, margin: '6px 0 8px' }}>{checkedIn.token.token_number}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{checkedIn.patient.full_name}</div>
              <div className="hq-num" style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>
                {checkedIn.ewt.patients_ahead} ahead, estimated wait{' '}
                {checkedIn.ewt.ewt_low != null && checkedIn.ewt.ewt_high != null
                  ? `${checkedIn.ewt.ewt_low}–${checkedIn.ewt.ewt_high} min`
                  : `about ${checkedIn.ewt.ewt_minutes} min`}
              </div>
              <button type="button" className="hq-btn" onClick={printSlip}
                style={{ marginTop: 14, background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                Print token slip
              </button>
              <TokenSlip token={checkedIn.token.token_number} servicePoint={checkedIn.service_point}
                visitType={checkedIn.category?.name} ewt={checkedIn.ewt} issuedAt={checkedIn.token.arrival_time} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
