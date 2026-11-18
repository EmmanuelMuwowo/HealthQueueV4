import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';

const S = {
  page: { maxWidth: 880 },
  heading: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  callBtn: { minHeight: 50, padding: '10px 28px', fontSize: 17, borderRadius: 12 },
  hero: { marginBottom: 24 },
  heroActions: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' },
  heroBtn: { background: '#fff', color: 'var(--hq-blue)', minHeight: 46, padding: '10px 22px', fontSize: 16 },
  heroGhost: { background: 'rgba(255,255,255,0.18)', color: '#fff', minHeight: 46, padding: '10px 18px', fontSize: 15 },
  heroPill: { background: 'rgba(255,255,255,0.2)', color: '#fff', marginLeft: 'auto' },
  progressText: { fontSize: 14, fontWeight: 600, marginTop: 18 },
  progressTrack: { height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.25)', marginTop: 8, overflow: 'hidden' },
  progressFill: (pct, over) => ({
    height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4, background: over ? '#FF9F0A' : '#fff',
    transition: 'width 600ms',
  }),
  emptyHero: { marginBottom: 24, textAlign: 'center', padding: '36px 20px' },
  followGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end', marginTop: 12 },
  token: { fontSize: 18, fontWeight: 700, color: 'var(--hq-blue)', width: 92, flex: 'none' },
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
  const [allCategories, setAllCategories] = useState([]);
  const [servicePoints, setServicePoints] = useState([]);
  const [followFor, setFollowFor] = useState(null); // the patient just completed
  const [follow, setFollow] = useState({ date: '', time: '09:00', category_id: '' });
  const [followDone, setFollowDone] = useState('');
  const [refer, setRefer] = useState({ service_point_id: '', category_id: '' });
  const [referDone, setReferDone] = useState('');

  useEffect(() => {
    api.get('/visits/categories').then((res) => setAllCategories(res.data)).catch(() => {});
    api.get('/visits/service-points').then((res) => setServicePoints(res.data)).catch(() => {});
  }, []);

  const categories = allCategories.filter((c) => String(c.service_point_id) === String(spId));
  const otherPoints = servicePoints.filter((sp) => String(sp.id) !== String(spId));
  const typesFor = (id) => allCategories.filter((c) => String(c.service_point_id) === String(id));
  const defaultTypeFor = (id) => {
    const list = typesFor(id);
    return String((list.find((c) => c.is_default) || list[0] || {}).id || '');
  };

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
      setReferDone('');
      setFollowFor({ id: token.id, token_number: token.token_number, full_name: token.full_name });
      setFollow({ date: lusakaDate(7), time: '09:00', category_id: followCategory() });
      // Most outpatient visits end at the pharmacy, so offer it first
      const target = otherPoints.find((sp) => sp.code === 'PHA') || otherPoints[0];
      setRefer({
        service_point_id: target ? String(target.id) : '',
        category_id: target ? defaultTypeFor(target.id) : '',
      });
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
    } catch (err) {
      setError(err.response?.data?.error || 'Could not book the follow-up.');
    } finally {
      setBusy(false);
    }
  };

  const referPatient = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/referrals', {
        token_id: followFor.id,
        service_point_id: parseInt(refer.service_point_id),
        category_id: refer.category_id ? parseInt(refer.category_id) : undefined,
      });
      const e = res.data.ewt;
      setReferDone(
        `${res.data.token.token_number} issued at ${res.data.service_point} · ` +
        `${e.patients_ahead} ahead · wait ${e.ewt_low}–${e.ewt_high} min. ` +
        (res.data.patient.phone_number ? 'SMS sent to the patient.' : 'No phone number: tell the patient the token.')
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Could not refer the patient.');
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
      <div>
        <TopBar subtitle="Clinic" />
        <main className="hq-page" style={S.page}>
          {error ? <div className="hq-notice is-error" role="alert">{error}</div> : <div className="hq-empty">Loading the queue…</div>}
        </main>
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
    <div>
      <TopBar subtitle={`Clinic, ${queue.service_point.name}`} />
      <main className="hq-page" style={S.page}>
        <div style={S.heading}>
          <div>
            <h1 className="hq-large-title">{queue.service_point.name}</h1>
            <div className="hq-footnote hq-num" style={{ marginTop: 4 }}>
              {queue.waiting.length} waiting{(queue.skipped || []).length ? `, ${queue.skipped.length} skipped today` : ''}
            </div>
          </div>
          <button type="button" className="hq-btn hq-btn-primary" style={S.callBtn}
            disabled={busy || !!current}
            title={current ? 'Complete or mark the current patient as a no-show first' : undefined}
            onClick={() => act(() => api.post(`/queue/${spId}/call-next`))}>
            Call next
          </button>
        </div>

        {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

        {current ? (
          <section className="hq-token-card" style={S.hero} aria-live="polite">
            <div style={{ fontSize: 15, opacity: 0.85 }}>
              {current.status === 'called' ? 'Called, waiting for the patient' : 'Now serving'}
              {current.category_name ? `, ${current.category_name}` : ''}
            </div>
            <div className="hq-token" style={{ margin: '8px 0 6px' }}>{current.token_number}</div>
            <div style={{ fontSize: 19, fontWeight: 600 }}>{current.full_name}</div>

            <div style={S.heroActions}>
              {current.status === 'called' ? (
                <button type="button" className="hq-btn" style={S.heroBtn} disabled={busy}
                  onClick={() => act(() => api.put(`/queue/tokens/${current.id}/start`))}>
                  Start consultation
                </button>
              ) : (
                <button type="button" className="hq-btn" style={S.heroBtn} disabled={busy}
                  onClick={() => complete(current)}>
                  Complete
                </button>
              )}
              {current.status === 'called' && (
                <button type="button" className="hq-btn" style={S.heroGhost} disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Mark ${current.token_number} as a no-show?`)) {
                      act(() => api.put(`/queue/tokens/${current.id}/skip`));
                    }
                  }}>
                  No-show
                </button>
              )}
              <span className="hq-pill" style={S.heroPill}>
                {current.status === 'called' ? 'Called' : 'In consultation'}
              </span>
            </div>

            {showProgress && (
              <>
                <div className="hq-num" style={S.progressText}>
                  {Math.floor(elapsed)} of {Math.round(typical)} min typical{over ? ', running over' : ''}
                </div>
                <div style={S.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100}
                  aria-valuenow={Math.min(Math.round(pct), 100)}>
                  <div style={S.progressFill(pct, over)} />
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="hq-panel" style={S.emptyHero}>
            <div className="hq-headline">No patient called</div>
            <div className="hq-footnote" style={{ marginTop: 4 }}>
              {queue.waiting.length > 0 ? 'Press Call next to call the first patient in the queue.' : 'The queue is empty. New patients appear here automatically.'}
            </div>
          </section>
        )}

        {followFor && (
          <section className="hq-panel" style={{ marginBottom: 24, borderTop: '4px solid #34C759' }} aria-label="After the consultation">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div className="hq-headline">{followFor.token_number} completed</div>
                <div className="hq-footnote">{followFor.full_name}</div>
              </div>
              <button type="button" className="hq-btn hq-btn-secondary" disabled={busy} onClick={() => setFollowFor(null)}>
                Done
              </button>
            </div>

            <div className="hq-headline" style={{ fontSize: 15, marginTop: 18 }}>Book a follow-up visit</div>
            {followDone ? (
              <div className="hq-notice is-success" style={{ marginTop: 8 }}>{followDone}</div>
            ) : (
              <>
                <div className="hq-caption" style={{ marginTop: 2 }}>
                  Optional. Reminder SMS are sent the day before and 2 hours before.
                </div>
                <div style={S.followGrid}>
                  <div className="hq-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="f_date">Date</label>
                    <input id="f_date" type="date" className="hq-input" value={follow.date} min={lusakaDate(1)}
                      onChange={(e) => setFollow({ ...follow, date: e.target.value })} />
                  </div>
                  <div className="hq-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="f_time">Time</label>
                    <input id="f_time" type="time" className="hq-input" value={follow.time}
                      onChange={(e) => setFollow({ ...follow, time: e.target.value })} />
                  </div>
                  <div className="hq-field" style={{ marginBottom: 0 }}>
                    <label htmlFor="f_cat">Visit type</label>
                    <select id="f_cat" className="hq-select" value={follow.category_id}
                      onChange={(e) => setFollow({ ...follow, category_id: e.target.value })}>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <button type="button" className="hq-btn hq-btn-primary" style={{ minHeight: 44 }}
                    disabled={busy || !follow.date || !follow.time} onClick={bookFollowUp}>
                    Book follow-up
                  </button>
                </div>
              </>
            )}

            {otherPoints.length > 0 && (
              <>
                <div className="hq-headline" style={{ fontSize: 15, marginTop: 22 }}>Send to another service point</div>
                {referDone ? (
                  <div className="hq-notice is-success" style={{ marginTop: 8 }}>{referDone}</div>
                ) : (
                  <>
                    <div className="hq-caption" style={{ marginTop: 2 }}>
                      Optional. The patient joins that queue straight away, without going back to reception.
                    </div>
                    <div style={S.followGrid}>
                      <div className="hq-field" style={{ marginBottom: 0 }}>
                        <label htmlFor="r_sp">Service point</label>
                        <select id="r_sp" className="hq-select" value={refer.service_point_id}
                          onChange={(e) => setRefer({ service_point_id: e.target.value, category_id: defaultTypeFor(e.target.value) })}>
                          {otherPoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                        </select>
                      </div>
                      <div className="hq-field" style={{ marginBottom: 0 }}>
                        <label htmlFor="r_cat">Visit type</label>
                        <select id="r_cat" className="hq-select" value={refer.category_id}
                          onChange={(e) => setRefer({ ...refer, category_id: e.target.value })}>
                          {typesFor(refer.service_point_id).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <button type="button" className="hq-btn hq-btn-primary" style={{ minHeight: 44 }}
                        disabled={busy || !refer.service_point_id} onClick={referPatient}>
                        Send patient
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        <div className="hq-group-title hq-num">Waiting ({queue.waiting.length})</div>
        {queue.waiting.length === 0 ? (
          <div className="hq-group"><div className="hq-empty">No patients waiting.</div></div>
        ) : (
          <div className="hq-group">
            {queue.waiting.map((t) => (
              <div key={t.id} className="hq-row">
                <div style={S.token}>{t.token_number}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{t.full_name}</div>
                  {t.category_name && <div className="hq-caption">{t.category_name}</div>}
                </div>
                {t.priority === 'urgent' && <span className="hq-pill is-red">Urgent</span>}
                <div className="hq-footnote hq-num" style={{ textAlign: 'right', minWidth: 120 }}>
                  {t.patients_ahead} ahead, {wait(t)}
                </div>
              </div>
            ))}
          </div>
        )}

        {(queue.skipped || []).length > 0 && (
          <>
            <div className="hq-group-title hq-num">Skipped today ({queue.skipped.length})</div>
            <div className="hq-group">
              {queue.skipped.map((t) => (
                <div key={t.id} className="hq-row">
                  <div style={{ ...S.token, color: 'var(--hq-label-2)' }}>{t.token_number}</div>
                  <div style={{ flex: 1 }}>{t.full_name}</div>
                  <button type="button" className="hq-btn hq-btn-secondary" style={{ minHeight: 34, padding: '6px 14px', fontSize: 14 }}
                    disabled={busy} onClick={() => act(() => api.put(`/queue/tokens/${t.id}/requeue`))}>
                    Re-queue
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {(queue.category_aht || []).length > 0 && (
          <>
            <div className="hq-group-title">Typical consultation time</div>
            <div className="hq-group">
              {queue.category_aht.map((c) => (
                <div key={c.name} className="hq-row">
                  <span className="hq-row-label">{c.name}</span>
                  <span className="hq-row-value hq-num">
                    {Math.round(c.aht_minutes)} min,{' '}
                    {c.source === 'ewma'
                      ? `from ${c.sample_size} recent visit${c.sample_size === 1 ? '' : 's'}`
                      : 'default (fewer than 3 recent visits)'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <p className="hq-caption" style={{ textAlign: 'center', marginTop: 18 }}>
          Wait = time left in the current consultation plus the typical time of each patient ahead,
          shown as a range. The queue refreshes every 3 seconds.
        </p>
      </main>
    </div>
  );
}
