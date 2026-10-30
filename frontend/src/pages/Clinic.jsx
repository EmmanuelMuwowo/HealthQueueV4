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
};

export default function Clinic() {
  const staff = JSON.parse(sessionStorage.getItem('staff') || '{}');
  const spId = staff.service_point_id || 1;
  const [queue, setQueue] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
            <div style={S.heroActions}>
              {current.status === 'called' ? (
                <button style={S.heroBtn} disabled={busy}
                  onClick={() => act(() => api.put(`/queue/tokens/${current.id}/start`))}>
                  Start consultation
                </button>
              ) : (
                <button style={S.heroBtn} disabled={busy}
                  onClick={() => act(() => api.put(`/queue/tokens/${current.id}/complete`))}>
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
          </div>
        ) : (
          <div style={S.heroEmpty}>No patient called. Press "Call next" to begin.</div>
        )}

        <div style={S.sectionLabel}>Waiting ({queue.waiting.length})</div>
        {queue.waiting.length === 0 ? (
          <div style={S.empty}>No patients waiting.</div>
        ) : (
          queue.waiting.map((t) => (
            <div key={t.id} style={S.row}>
              <div style={S.rowToken}>{t.token_number}</div>
              <div style={S.rowName}>{t.full_name}</div>
              {t.priority === 'urgent' && <span style={S.urgentBadge}>URGENT</span>}
              <div style={S.ewt}>{t.patients_ahead} ahead · {t.ewt_minutes} min</div>
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

        <div style={S.note}>
          EWT = time left in the current consultation + patients ahead × {queue.avg_service_minutes} min
          ({queue.avg_source === 'default' ? 'default average' : 'rolling average of recent visits'})
          {queue.current_elapsed_minutes !== null && queue.current_elapsed_minutes !== undefined && (
            <> · current consultation {queue.current_elapsed_minutes} min so far,
              about {queue.current_remaining_minutes} min left</>
          )}
          {' · '}refreshes every 3 seconds
        </div>
      </div>
    </div>
  );
}