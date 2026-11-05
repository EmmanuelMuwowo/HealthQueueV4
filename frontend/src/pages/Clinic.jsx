import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';

const S = {
  page: {
    minHeight: '100vh', backgroundColor: '#F2F2F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  body: { maxWidth: 800, margin: '0 auto', padding: '28px 20px' },
  heading: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  h1: { fontSize: 24, fontWeight: 700, color: '#1C1C1E', margin: 0 },
  callBtn: (disabled) => ({
    padding: '12px 24px', backgroundColor: disabled ? '#C7C7CC' : '#34C759', color: '#fff',
    border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  error: {
    color: '#FF3B30', fontSize: 14, backgroundColor: '#FFF2F2',
    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
  },
  hero: {
    background: 'linear-gradient(135deg, #007AFF 0%, #0055D4 100%)', borderRadius: 20,
    padding: 28, color: '#fff', marginBottom: 24,
  },
  heroEmpty: {
    backgroundColor: '#fff', borderRadius: 20, padding: 28, color: '#8E8E93',
    textAlign: 'center', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  heroLabel: { fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.75, textTransform: 'uppercase' },
  heroToken: { fontSize: 52, fontWeight: 700, margin: '4px 0' },
  heroActions: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 },
  heroBtn: {
    padding: '12px 24px', backgroundColor: '#fff', color: '#0055D4', border: 'none',
    borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer',
  },
  statusPill: {
    padding: '6px 14px', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    fontSize: 13, fontWeight: 600,
  },
  sectionLabel: {
    fontSize: 13, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 10,
  },
  row: {
    backgroundColor: '#fff', borderRadius: 12, padding: '14px 18px', marginBottom: 8,
    display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  rowToken: { fontSize: 20, fontWeight: 700, color: '#007AFF', minWidth: 90 },
  rowName: { flex: 1, fontSize: 15, fontWeight: 500, color: '#1C1C1E' },
  urgentBadge: {
    padding: '3px 10px', borderRadius: 20, backgroundColor: '#FFE5E5',
    color: '#CC0000', fontSize: 12, fontWeight: 600,
  },
  ewt: { fontSize: 13, color: '#8E8E93', textAlign: 'right', minWidth: 110 },
  empty: {
    textAlign: 'center', padding: 40, color: '#8E8E93',
    backgroundColor: '#fff', borderRadius: 12,
  },
  note: { fontSize: 12, color: '#8E8E93', marginTop: 16, textAlign: 'center' },

    noShowBtn: {
    padding: '12px 20px', backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.5)', borderRadius: 10, fontSize: 15,
    fontWeight: 600, cursor: 'pointer',
  },
  requeueBtn: {
    padding: '7px 14px', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  progressText: { fontSize: 14, fontWeight: 600, marginTop: 14 },
  progressTrack: {
    height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)',
    marginTop: 6, overflow: 'hidden',
  },
  progressFill: (pct, over) => ({
    height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4,
    backgroundColor: over ? '#FF9500' : '#fff',
  }),
  ahtList: {
    backgroundColor: '#fff', borderRadius: 12, padding: '12px 16px', marginTop: 24,
    fontSize: 13, color: '#3C3C43', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
  ahtRow: { display: 'flex', justifyContent: 'space-between', padding: '4px 0' },
  followCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '2px solid #34C759',
  },
  followRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 },
  followField: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#3C3C43' },
  followInput: {
    padding: '9px 10px', borderRadius: 8, border: '1px solid #E5E5EA', fontSize: 14,
    backgroundColor: '#FAFAFA',
  },
  followBtn: {
    padding: '10px 18px', backgroundColor: '#34C759', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  skipBtn: {
    padding: '10px 14px', backgroundColor: '#F2F2F7', color: '#3C3C43', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  done: {
    color: '#1A7A5E', fontSize: 14, backgroundColor: '#E8F8F2',
    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
  },
};

// YYYY-MM-DD in Lusaka time, `days` from today
const lusakaDate = (days = 0) =>
  new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });

const wait = (t) =>
  t.ewt_low != null && t.ewt_high != null ? `${t.ewt_low}–${t.ewt_high} min` : `${t.ewt_minutes} min`;

export default function Clinic() {
  const staff = JSON.parse(sessionStorage.getItem('staff') || '{}');
  const spId = staff.service_point_id || 1;
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState([]);
  const [followFor, setFollowFor] = useState(null); // the patient just completed
  const [follow, setFollow] = useState({ date: '', time: '09:00', category_id: '' });
  const [followDone, setFollowDone] = useState('');

  useEffect(() => {
    api.get('/visits/categories')
      .then((res) => setCategories(res.data.filter((c) => String(c.service_point_id) === String(spId))))
      .catch(() => {});
  }, [spId]);

  // Offer the visit type that looks like a follow-up, otherwise the usual one
  const followCategory = () => {
    const f = categories.find((c) => /follow|refill|review/i.test(c.name));
    const def = categories.find((c) => c.is_default);
    return String((f || def || categories[0] || {}).id || '');
  };

  const complete = async (token) => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/queue/tokens/${token.id}/complete`);
      setFollowDone('');
      setFollowFor({ id: token.id, token_number: token.token_number, full_name: token.full_name });
      setFollow({ date: lusakaDate(7), time: '09:00', category_id: followCategory() });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'That action failed.');
    } finally {
      setBusy(false);
    }
  };

  const bookFollowUp = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/follow-ups', {
        token_id: followFor.id,
        date: follow.date,
        time: follow.time,
        category_id: follow.category_id ? parseInt(follow.category_id) : undefined,
      });
      setFollowDone(
        `Follow-up booked for ${followFor.token_number} on ${follow.date} at ${follow.time}. ` +
        (res.data.reminders === 'scheduled'
          ? 'Reminder SMS will be sent the day before and 2 hours before.'
          : 'No phone number, so no reminder SMS.')
      );
      setFollowFor(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not book the follow-up.');
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/queue/${spId}`);
      setQueue(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the queue.');
    }
  }, [spId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (request) => {
    setBusy(true);
    setError('');
    try {
      await request();
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'That action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!queue) {
    return (
      <div style={S.page}>
        <TopBar subtitle="Clinic · Queue" />
        <div style={S.body}>{error ? <div style={S.error}>{error}</div> : 'Loading queue...'}</div>
      </div>
    );
  }

  const current = queue.now_serving;

  // How far the current consultation is through the typical time for its visit type
  const typical = current
    ? (queue.category_aht || []).find((c) => c.name === current.category_name)?.aht_minutes
      ?? queue.avg_service_minutes
    : null;
  const elapsed = queue.current_elapsed_minutes;
  const showProgress = current && current.status === 'in_consultation'
    && elapsed !== null && elapsed !== undefined && typical;
  const pct = showProgress ? (elapsed / typical) * 100 : 0;
  const over = showProgress && elapsed > typical;

  return (
    <div style={S.page}>
      <TopBar subtitle={`Clinic · ${queue.service_point.name}`} />
      <div style={S.body}>
        <div style={S.heading}>
          <h1 style={S.h1}>{queue.service_point.name}</h1>
          <button
            style={S.callBtn(busy || !!current)}
            disabled={busy || !!current}
            onClick={() => act(() => api.post(`/queue/${spId}/call-next`))}
          >
            Call next
          </button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {current ? (
          <div style={S.hero}>
            <div style={S.heroLabel}>Now serving</div>
            <div style={S.heroToken}>{current.token_number}</div>
            <div style={{ fontSize: 18 }}>{current.full_name}</div>
            {current.category_name && (
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>{current.category_name}</div>
            )}
            <div style={S.heroActions}>
              {current.status === 'called' ? (
                <button style={S.heroBtn} disabled={busy}
                  onClick={() => act(() => api.put(`/queue/tokens/${current.id}/start`))}>
                  Start consultation
                </button>
              ) : (
                <button style={S.heroBtn} disabled={busy}
                  onClick={() => complete(current)}>
                  Complete
                </button>
              )}
                            {current.status === 'called' && (
                <button style={S.noShowBtn} disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Mark ${current.token_number} as a no-show?`)) {
                      act(() => api.put(`/queue/tokens/${current.id}/skip`));
                    }
                  }}>
                  No-show
                </button>
              )}
              <span style={S.statusPill}>{current.status.replace('_', ' ')}</span>
            </div>
            {showProgress && (
              <>
                <div style={S.progressText}>
                  {Math.floor(elapsed)} of {Math.round(typical)} min typical
                  {over ? ' · running over' : ''}
                </div>
                <div style={S.progressTrack}>
                  <div style={S.progressFill(pct, over)} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={S.heroEmpty}>No patient called. Press "Call next" to begin.</div>
        )}

        {followDone && <div style={S.done}>{followDone}</div>}

        {followFor && (
          <div style={S.followCard}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1C1C1E' }}>
              {followFor.token_number} completed. Book a follow-up visit?
            </div>
            <div style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}>
              {followFor.full_name} · reminders go by SMS the day before and 2 hours before
            </div>
            <div style={S.followRow}>
              <label style={S.followField}>Date
                <input type="date" style={S.followInput} value={follow.date} min={lusakaDate(1)}
                  onChange={(e) => setFollow({ ...follow, date: e.target.value })} />
              </label>
              <label style={S.followField}>Time
                <input type="time" style={S.followInput} value={follow.time}
                  onChange={(e) => setFollow({ ...follow, time: e.target.value })} />
              </label>
              <label style={S.followField}>Visit type
                <select style={S.followInput} value={follow.category_id}
                  onChange={(e) => setFollow({ ...follow, category_id: e.target.value })}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <button style={S.followBtn} disabled={busy || !follow.date || !follow.time}
                onClick={bookFollowUp}>
                Book follow-up
              </button>
              <button style={S.skipBtn} disabled={busy} onClick={() => setFollowFor(null)}>
                No follow-up
              </button>
            </div>
          </div>
        )}

        <div style={S.sectionLabel}>Waiting ({queue.waiting.length})</div>
        {queue.waiting.length === 0 ? (
          <div style={S.empty}>No patients waiting.</div>
        ) : (
          queue.waiting.map((t) => (
            <div key={t.id} style={S.row}>
              <div style={S.rowToken}>{t.token_number}</div>
                <div style={S.rowName}>
                {t.full_name}
                {t.category_name && (
                  <div style={{ fontSize: 12, color: '#8E8E93', fontWeight: 400 }}>{t.category_name}</div>
                )}
              </div>
              {t.priority === 'urgent' && <span style={S.urgentBadge}>URGENT</span>}
              <div style={S.ewt}>{t.patients_ahead} ahead · {wait(t)}</div>
            </div>
          ))
        )}

                {(queue.skipped || []).length > 0 && (
          <>
            <div style={{ ...S.sectionLabel, marginTop: 24 }}>
              Skipped today ({queue.skipped.length})
            </div>
            {queue.skipped.map((t) => (
              <div key={t.id} style={S.row}>
                <div style={S.rowToken}>{t.token_number}</div>
                <div style={S.rowName}>{t.full_name}</div>
                <button style={S.requeueBtn} disabled={busy}
                  onClick={() => act(() => api.put(`/queue/tokens/${t.id}/requeue`))}>
                  Re-queue
                </button>
              </div>
            ))}
          </>
        )}

        {(queue.category_aht || []).length > 0 && (
          <div style={S.ahtList}>
            <div style={{ ...S.sectionLabel, marginBottom: 6 }}>Typical consultation time</div>
            {queue.category_aht.map((c) => (
              <div key={c.name} style={S.ahtRow}>
                <span>{c.name}</span>
                <span style={{ color: '#8E8E93' }}>
                  {Math.round(c.aht_minutes)} min ·{' '}
                  {c.source === 'ewma'
                    ? `from ${c.sample_size} recent visit${c.sample_size === 1 ? '' : 's'}`
                    : 'default (fewer than 3 recent visits)'}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={S.note}>
          Wait = time left in the current consultation + the typical time of each patient ahead,
          shown as a range · refreshes every 3 seconds
        </div>
      </div>
    </div>
  );
}