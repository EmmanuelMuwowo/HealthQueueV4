import { useState, useEffect } from 'react';
import api from '../services/api';

const S = {
  page: {
    minHeight: '100vh', backgroundColor: '#F2F2F7', padding: '24px 32px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: {
    width: 44, height: 44, backgroundColor: '#007AFF', borderRadius: 12, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22,
  },
  title: { fontSize: 22, fontWeight: 700, color: '#1C1C1E' },
  sub: { fontSize: 14, color: '#8E8E93' },
  live: {
    display: 'flex', alignItems: 'center', gap: 6, backgroundColor: '#E8F5E9', color: '#2E7D32',
    borderRadius: 20, padding: '6px 14px', fontSize: 14, fontWeight: 600,
  },
  dot: { width: 8, height: 8, borderRadius: '50%', backgroundColor: '#34C759' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: 20 },
  card: {
    flex: '1 1 420px', backgroundColor: '#fff', borderRadius: 20, padding: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  spName: { fontSize: 20, fontWeight: 700, color: '#1C1C1E', marginBottom: 14 },
  serving: (called) => ({
    background: called
      ? 'linear-gradient(135deg, #FF9500 0%, #E07B00 100%)'
      : 'linear-gradient(135deg, #007AFF 0%, #0055D4 100%)',
    borderRadius: 16, padding: '18px 22px', color: '#fff', marginBottom: 16,
  }),
  servingLabel: { fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.85, textTransform: 'uppercase' },
  servingToken: { fontSize: 56, fontWeight: 700, lineHeight: 1.1 },
  idle: {
    backgroundColor: '#F2F2F7', borderRadius: 16, padding: '24px 22px', color: '#8E8E93',
    marginBottom: 16, textAlign: 'center', fontSize: 16,
  },
  waitHead: {
    fontSize: 12, fontWeight: 600, color: '#8E8E93', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 8,
  },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 0', borderBottom: '1px solid #F2F2F7',
  },
  token: { fontSize: 22, fontWeight: 700, color: '#007AFF' },
  urgent: {
    fontSize: 11, fontWeight: 700, color: '#CC0000', backgroundColor: '#FFE5E5',
    borderRadius: 12, padding: '2px 8px', marginLeft: 8,
  },
  ewt: { fontSize: 16, color: '#3C3C43' },
  empty: { color: '#8E8E93', fontSize: 15, padding: '8px 0' },
  footer: { textAlign: 'center', marginTop: 24, fontSize: 13, color: '#8E8E93' },
};

export default function Display() {
  const [data, setData] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
        const load = () =>
      api.get('/public/queue')
        .then((res) => {
          setData(res.data);
          // A reply from the service worker's cache means the data may be out of date
          setOffline(Boolean(res.headers['x-hq-from-cache']));
        })
        .catch(() => setOffline(true));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const updated = data
    ? new Date(data.updated_at).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lusaka',
      })
    : '--:--';

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.brand}>
          <div style={S.logo}>H</div>
          <div>
            <div style={S.title}>Kalingalinga Clinic</div>
            <div style={S.sub}>Live queue status</div>
          </div>
        </div>
        <div style={offline
          ? { ...S.live, backgroundColor: '#F2F2F7', color: '#8E8E93' }
          : S.live}>
          <div style={offline ? { ...S.dot, backgroundColor: '#8E8E93' } : S.dot} />
          {offline ? `OFFLINE · last update ${updated}` : 'LIVE'}
        </div>
      </div>

      <div style={S.grid}>
        {data && data.service_points.map((sp) => (
          <div key={sp.id} style={S.card}>
            <div style={S.spName}>{sp.name}</div>

            {sp.now_serving ? (
              <div style={S.serving(sp.now_serving.status === 'called')}>
                <div style={S.servingLabel}>
                  {sp.now_serving.status === 'called' ? 'Please proceed to the room' : 'Now serving'}
                </div>
                <div style={S.servingToken}>{sp.now_serving.token_number}</div>
              </div>
            ) : (
              <div style={S.idle}>No patient being served</div>
            )}

            <div style={S.waitHead}>Waiting ({sp.waiting_count})</div>
            {sp.waiting.length === 0 ? (
              <div style={S.empty}>Nobody waiting</div>
            ) : (
              sp.waiting.map((t) => (
                <div key={t.token_number} style={S.row}>
                  <div>
                    <span style={S.token}>{t.token_number}</span>
                    {t.priority === 'urgent' && <span style={S.urgent}>URGENT</span>}
                  </div>
                  <div style={S.ewt}>
                    {t.ewt_low != null && t.ewt_high != null
                      ? `${t.ewt_low}–${t.ewt_high} min`
                      : `≈ ${t.ewt_minutes} min`}
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      <div style={S.footer}>Updated {updated} · refreshes every 5 seconds · estimates are approximate</div>
    </div>
  );
}