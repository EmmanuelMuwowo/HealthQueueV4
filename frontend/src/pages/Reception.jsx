import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';
import ReceptionNav from '../components/ReceptionNav';
import { newRef, addPending, getPending, removePending, syncPending } from '../services/offlineQueue';
import { normalizePhone } from '../utils/phone';
import TokenSlip, { printSlip } from '../components/TokenSlip';

const S = {
  searchWrap: { background: 'var(--hq-bg)', borderRadius: 12, padding: 12, marginBottom: 20 },
  result: { cursor: 'pointer' },
  hint: { fontSize: 12, color: 'var(--hq-red)', marginTop: -2 },
  twoUp: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  actions: { display: 'flex', gap: 10, marginTop: 6 },
  heroMeta: { fontSize: 14, opacity: 0.85 },
  savedCard: {
    background: '#636366', color: '#fff', borderRadius: 'var(--hq-r-hero)', padding: '24px 28px',
  },
  statValue: { fontSize: 22, fontWeight: 700, color: 'var(--hq-label)' },
};

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
  });
const day = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lusaka',
  });
const shortRef = (ref) => ref.slice(0, 8).toUpperCase();
const hasRange = (e) => e && e.ewt_low != null && e.ewt_high != null;
const waitRange = (e) => (hasRange(e) ? `${e.ewt_low}–${e.ewt_high} min` : `${e.ewt_minutes} min`);

export default function Reception() {
  const [servicePoints, setServicePoints] = useState([]);
  const [form, setForm] = useState({
    full_name: '', phone_number: '', gender: '', service_point_id: '', reason: '', category_id: '',
  });
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [searchMsg, setSearchMsg] = useState('');
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [savedOffline, setSavedOffline] = useState(null);
  const [pending, setPending] = useState(getPending());
  const [synced, setSynced] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);

  // Service points, with an offline copy (the list is not sensitive)
  useEffect(() => {
    const apply = (list) => {
      setServicePoints(list);
      if (list.length > 0) {
        setForm((f) => ({ ...f, service_point_id: f.service_point_id || String(list[0].id) }));
      }
    };
    api.get('/visits/service-points')
      .then((res) => {
        localStorage.setItem('hq-service-points', JSON.stringify(res.data));
        apply(res.data);
      })
      .catch(() => {
        let saved = [];
        try { saved = JSON.parse(localStorage.getItem('hq-service-points') || '[]'); } catch { /* ignore */ }
        if (saved.length > 0) apply(saved);
        else setError('Could not load service points. Is the backend running?');
      });
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

  // Patient search, 300 ms after the receptionist stops typing
  useEffect(() => {
    if (selected || query.trim().length < 3) {
      setMatches([]);
      setSearchMsg('');
      return;
    }
    const timer = setTimeout(() => {
      api.get('/patients/search', { params: { q: query.trim() } })
        .then((res) => {
          setMatches(res.data);
          setSearchMsg(res.data.length === 0 ? 'No matching patient. Register them as new below.' : '');
        })
        .catch((err) => {
          setMatches([]);
          setSearchMsg(err.response ? 'Search failed.' : 'Search needs a connection. Register as new for now.');
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selected]);

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

  const choosePatient = (p) => {
    setSelected(p);
    setQuery('');
    setMatches([]);
    setError('');
  };

  const resetPatient = () => {
    setSelected(null);
    setForm({ ...form, full_name: '', phone_number: '', gender: '', reason: '' });
  };

  const phoneTyped = form.phone_number.trim() !== '';
  const phoneInvalid = !selected && phoneTyped && !normalizePhone(form.phone_number);

  const submit = async (priority) => {
    if (!selected && !form.full_name.trim()) {
      setError('Patient full name is required.');
      return;
    }
    if (phoneInvalid) {
      setError('Check the phone number. Use a Zambian mobile number such as 0977123456.');
      return;
    }
    setLoading(true);
    setError('');
    setSavedOffline(null);

    const sp = servicePoints.find((s) => String(s.id) === String(form.service_point_id));
    const body = {
      ...(selected
        ? { patient_id: selected.id, full_name: selected.full_name }
        : {
            full_name: form.full_name,
            phone_number: phoneTyped ? normalizePhone(form.phone_number) : '',
            gender: form.gender,
          }),
      reason: form.reason,
      service_point_id: parseInt(form.service_point_id),
      category_id: form.category_id ? parseInt(form.category_id) : undefined,
      priority,
      client_ref: newRef(),
      captured_at: new Date().toISOString(),
    };

    try {
      const res = await api.post('/visits', body);
      setResult(res.data);
      resetPatient();
    } catch (err) {
      setResult(null);
      if (!err.response) {
        const item = { ...body, service_point_name: sp?.name || 'Unknown service point' };
        addPending(item);
        setSavedOffline(item);
        resetPatient();
      } else {
        setError(err.response.data?.error || 'Could not register the patient.');
      }
    } finally {
      setLoading(false);
    }
  };

  const history = result?.patient_history;

  return (
    <div>
      <TopBar subtitle="Reception" />
      <ReceptionNav />
      <main className="hq-page hq-columns" style={{ paddingTop: 20 }}>
        {/* ---------------- Registration ---------------- */}
        <section className="hq-panel" aria-labelledby="reg-title">
          <h2 id="reg-title" className="hq-title" style={{ marginBottom: 16 }}>Register walk-in patient</h2>
          {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

          {!selected && (
            <div style={S.searchWrap}>
              <div className="hq-field" style={{ marginBottom: matches.length || searchMsg ? 10 : 0 }}>
                <label htmlFor="find">Find a returning patient by phone or name</label>
                <input id="find" className="hq-input" type="search" value={query}
                  placeholder="For example 0977 or Banda" autoComplete="off"
                  onChange={(e) => setQuery(e.target.value)} />
              </div>
              {matches.length > 0 && (
                <div className="hq-group" role="list">
                  {matches.map((p) => (
                    <div key={p.id} role="listitem" className="hq-row" style={S.result}
                      tabIndex={0} onClick={() => choosePatient(p)}
                      onKeyDown={(e) => e.key === 'Enter' && choosePatient(p)}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.full_name}</div>
                        <div className="hq-caption hq-num">
                          {p.phone_number || 'No phone'}, {p.visit_count} visit{p.visit_count === 1 ? '' : 's'}
                          {p.last_visit ? `, last on ${day(p.last_visit)}` : ''}
                        </div>
                      </div>
                      <span style={{ color: 'var(--hq-blue)', fontWeight: 600, fontSize: 14 }}>Select</span>
                    </div>
                  ))}
                </div>
              )}
              {searchMsg && <div className="hq-caption" style={{ marginTop: 8 }}>{searchMsg}</div>}
            </div>
          )}

          {selected ? (
            <div className="hq-group" style={{ marginBottom: 20 }}>
              <div className="hq-row">
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>{selected.full_name}</div>
                  <div className="hq-caption hq-num">
                    {selected.phone_number || 'No phone'}, {selected.visit_count} previous visit
                    {selected.visit_count === 1 ? '' : 's'}
                    {selected.last_visit ? `, last on ${day(selected.last_visit)}` : ''}
                  </div>
                </div>
                <span className="hq-pill is-green">Returning patient</span>
              </div>
              <div className="hq-row">
                <button type="button" className="hq-btn hq-btn-plain" style={{ padding: 0, minHeight: 0 }} onClick={resetPatient}>
                  Not this patient? Register someone new
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="hq-field">
                <label htmlFor="full_name">Full name</label>
                <input id="full_name" className="hq-input" value={form.full_name} autoComplete="off"
                  onChange={update('full_name')} required />
              </div>
              <div style={S.twoUp}>
                <div className="hq-field">
                  <label htmlFor="phone">Phone number (optional)</label>
                  <input id="phone" className="hq-input hq-num" value={form.phone_number} inputMode="tel"
                    placeholder="0977123456" autoComplete="off" onChange={update('phone_number')}
                    aria-invalid={phoneInvalid || undefined}
                    style={phoneInvalid ? { borderColor: 'var(--hq-red)' } : undefined} />
                  {phoneInvalid && (
                    <div style={S.hint}>Use 10 digits starting 095, 096, 097, 075, 076 or 077.</div>
                  )}
                </div>
                <div className="hq-field">
                  <label htmlFor="gender">Gender</label>
                  <select id="gender" className="hq-select" value={form.gender} onChange={update('gender')}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div style={S.twoUp}>
            <div className="hq-field">
              <label htmlFor="sp">Service point</label>
              <select id="sp" className="hq-select" value={form.service_point_id} onChange={update('service_point_id')}>
                {servicePoints.map((sp) => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            </div>
            <div className="hq-field">
              <label htmlFor="cat">Visit type</label>
              <select id="cat" className="hq-select" value={form.category_id} onChange={update('category_id')}>
                {spCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="hq-field">
            <label htmlFor="reason">Reason for visit (optional)</label>
            <input id="reason" className="hq-input" value={form.reason} onChange={update('reason')} />
          </div>

          <div style={S.actions}>
            <button type="button" className="hq-btn hq-btn-primary" style={{ flex: 1, minHeight: 48 }}
              disabled={loading} onClick={() => submit('normal')}>
              {loading ? 'Registering…' : 'Issue token'}
            </button>
            <button type="button" className="hq-btn hq-btn-destructive" style={{ minHeight: 48 }}
              disabled={loading} onClick={() => submit('urgent')}>
              Urgent
            </button>
          </div>
        </section>

        {/* ---------------- Result ---------------- */}
        <section className="hq-panel" aria-labelledby="tok-title" aria-live="polite">
          <h2 id="tok-title" className="hq-title" style={{ marginBottom: 16 }}>Token</h2>

          {savedOffline ? (
            <div style={S.savedCard}>
              <span className="hq-pill" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
                Saved on this device, waiting to sync
              </span>
              <div className="hq-token" style={{ fontSize: 40, margin: '14px 0 6px' }}>Ref {shortRef(savedOffline.client_ref)}</div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{savedOffline.full_name}</div>
              <div style={{ ...S.heroMeta, marginTop: 6 }}>
                {savedOffline.service_point_name}, registered at {clock(savedOffline.captured_at)}.
                The token number is issued when the connection returns.
              </div>
            </div>
          ) : !result ? (
            <div className="hq-empty">Register a patient to issue a token.</div>
          ) : (
            <>
              {history && (
                <div style={{ marginBottom: 12 }}>
                  <span className={`hq-pill ${history.status === 'returning' ? 'is-green' : 'is-blue'}`}>
                    {history.status === 'returning'
                      ? `Returning patient, ${history.previous_visits} previous visit${history.previous_visits === 1 ? '' : 's'}`
                      : 'New patient, first visit'}
                  </span>
                  {result.token.priority === 'urgent' && (
                    <span className="hq-pill is-red" style={{ marginLeft: 6 }}>Urgent</span>
                  )}
                </div>
              )}
              <div className="hq-token-card">
                <div style={S.heroMeta}>
                  {result.service_point}{result.category ? `, ${result.category.name}` : ''}
                </div>
                <div className="hq-token" style={{ margin: '8px 0 10px' }}>{result.token.token_number}</div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{result.patient.full_name}</div>
                <div className="hq-num" style={S.heroMeta}>{result.patient.phone_number || 'No phone number'}</div>
              </div>

              <div className="hq-group" style={{ marginTop: 16 }}>
                <div className="hq-row">
                  <span className="hq-row-label">Patients ahead</span>
                  <span className="hq-num" style={S.statValue}>{result.ewt.patients_ahead}</span>
                </div>
                <div className="hq-row">
                  <span className="hq-row-label">Estimated wait</span>
                  <span className="hq-num" style={S.statValue}>{waitRange(result.ewt)}</span>
                </div>
                <div className="hq-row">
                  <span className="hq-row-label">Status</span>
                  <span className="hq-row-value" style={{ textTransform: 'capitalize' }}>{result.token.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" className={`hq-btn ${result.patient.phone_number ? 'hq-btn-secondary' : 'hq-btn-primary'}`}
                  onClick={printSlip}>
                  Print token slip
                </button>
                {!result.patient.phone_number && (
                  <span className="hq-footnote">No phone number, so no SMS. Give the patient a printed slip.</span>
                )}
              </div>
              <TokenSlip token={result.token.token_number} servicePoint={result.service_point}
                visitType={result.category?.name} ewt={result.ewt} issuedAt={result.token.arrival_time} />
              <p className="hq-caption" style={{ margin: '12px 4px 0' }}>
                {hasRange(result.ewt)
                  ? `Estimate ${result.ewt.ewt_minutes} min, shown as a range (80% to 130%, rounded to 5 min). `
                  : `Estimate ${result.ewt.ewt_minutes} min. `}
                Based on the visit types of the {result.ewt.patients_ahead} patient
                {result.ewt.patients_ahead === 1 ? '' : 's'} ahead, recent consultation times and the time
                patients take to walk in when called.
              </p>
            </>
          )}

          {pending.length > 0 && (
            <>
              <div className="hq-group-title">Waiting to sync ({pending.length})</div>
              <div className="hq-group">
                {pending.map((p) => (
                  <div key={p.client_ref} className="hq-row">
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }} className="hq-num">{shortRef(p.client_ref)} <span style={{ fontWeight: 400 }}>{p.full_name}</span></div>
                      <div className="hq-caption">{p.service_point_name}, {clock(p.captured_at)}</div>
                      {p.status === 'failed' && <div className="hq-caption" style={{ color: 'var(--hq-red)' }}>{p.error}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className={`hq-pill ${p.status === 'failed' ? 'is-red' : 'is-orange'}`}>
                        {p.status === 'failed' ? 'Failed' : 'Pending'}
                      </span>
                      {p.status === 'failed' && (
                        <button type="button" className="hq-btn hq-btn-plain" style={{ minHeight: 0, color: 'var(--hq-red)' }}
                          onClick={() => removePending(p.client_ref)}>Dismiss</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {synced.length > 0 && (
            <>
              <div className="hq-group-title">Recently synced</div>
              <div className="hq-group">
                {synced.map((r) => (
                  <div key={r.visit.id} className="hq-row">
                    <div>
                      <span className="hq-num" style={{ fontWeight: 600 }}>{r.token.token_number}</span>{' '}
                      {r.patient.full_name}
                      <div className="hq-caption">{r.service_point}</div>
                    </div>
                    <span className="hq-pill is-green">Synced</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
