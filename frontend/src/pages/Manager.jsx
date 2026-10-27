import { useState, useEffect } from 'react';
import api from '../services/api';
import TopBar from '../components/TopBar';

const S = {
  page: {
    minHeight: '100vh', backgroundColor: '#F2F2F7',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  body: { maxWidth: 1000, margin: '0 auto', padding: '28px 20px' },
  head: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 12, marginBottom: 20,
  },
  h1: { fontSize: 24, fontWeight: 700, color: '#1C1C1E', margin: 0 },
  filters: { display: 'flex', gap: 10 },
  control: {
    padding: '9px 12px', borderRadius: 10, border: '1px solid #E5E5EA',
    fontSize: 14, backgroundColor: '#fff',
  },
  grid: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  stat: {
    flex: 1, minWidth: 150, backgroundColor: '#fff', borderRadius: 14, padding: '16px 18px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  statNum: { fontSize: 30, fontWeight: 700, color: '#007AFF' },
  statLabel: { fontSize: 13, color: '#8E8E93', marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  h2: { fontSize: 17, fontWeight: 600, color: '#1C1C1E', margin: '0 0 4px' },
  hint: { fontSize: 12, color: '#8E8E93', margin: '0 0 16px' },
  barRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  barLabel: { width: 52, fontSize: 13, color: '#3C3C43' },
  barTrack: { flex: 1, height: 22, backgroundColor: '#F2F2F7', borderRadius: 6, overflow: 'hidden' },
  barValue: { width: 150, fontSize: 13, color: '#8E8E93' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '10px 8px', color: '#8E8E93', fontSize: 12,
    textTransform: 'uppercase', borderBottom: '1px solid #E5E5EA',
  },
  td: { padding: '12px 8px', borderBottom: '1px solid #F2F2F7', color: '#1C1C1E' },
  empty: { color: '#8E8E93', fontSize: 14, padding: '16px 0' },
  provenance: {
    fontSize: 13, color: '#3C3C43', backgroundColor: '#EAF3FF',
    borderRadius: 12, padding: '14px 18px', lineHeight: 1.6,
  },
  error: {
    color: '#FF3B30', fontSize: 14, backgroundColor: '#FFF2F2',
    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
  },
    tlRow: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0',
    borderBottom: '1px solid #F2F2F7',
  },
  tlTime: { width: 90, fontSize: 14, fontWeight: 700, color: '#007AFF', fontFamily: 'monospace' },
  tlLabel: { flex: 1, fontSize: 14, color: '#1C1C1E' },
  tlActor: { fontSize: 13, color: '#8E8E93' },
  tlSummary: {
    marginTop: 16, padding: '14px 18px', backgroundColor: '#EAF3FF',
    borderRadius: 12, fontSize: 14, color: '#3C3C43', lineHeight: 1.7,
  },
};

const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
const fmt = (v, unit = '') => (num(v) === null || Number.isNaN(num(v)) ? '—' : `${num(v)}${unit}`);
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

function BarChart({ rows, color, valueText }) {
  if (rows.length === 0) return <div style={S.empty}>No data for this selection.</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows.map((r) => (
    <div key={r.label} style={S.barRow}>
      <div style={S.barLabel}>{r.label}</div>
      <div style={S.barTrack}>
        <div style={{
          width: `${(r.value / max) * 100}%`, height: '100%', backgroundColor: color,
          minWidth: r.value > 0 ? 4 : 0,
        }} />
      </div>
      <div style={S.barValue}>{valueText(r)}</div>
    </div>
  ));
}

const EVENT_LABELS = {
  arrived: 'Arrived and registered',
  called: 'Called by clinician',
  consultation_started: 'Consultation started',
  completed: 'Consultation completed',
  skipped: 'Skipped (no-show)',
  recalled: 'Re-queued',
  cancelled: 'Cancelled',
};

const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Lusaka',
  });

export default function Manager() {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const [trend, setTrend] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [tokenId, setTokenId] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [date, setDate] = useState(today);
  const [spId, setSpId] = useState('');
  const [servicePoints, setServicePoints] = useState([]);
  const [summary, setSummary] = useState(null);
  const [compare, setCompare] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/visits/service-points').then((res) => setServicePoints(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { date };
    if (spId) params.service_point_id = spId;
    setError('');
    api.get('/analytics/summary', { params })
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load analytics.'));
    api.get('/analytics/service-points', { params: { date } })
      .then((res) => setCompare(res.data))
      .catch(() => {});
  }, [date, spId]);

    useEffect(() => {
    const params = { days: 14 };
    if (spId) params.service_point_id = spId;
    api.get('/analytics/trend', { params })
      .then((res) => setTrend(res.data.rows))
      .catch(() => {});
  }, [spId]);

    useEffect(() => {
    const params = { date };
    if (spId) params.service_point_id = spId;
    setTokenId('');
    setTimeline(null);
    api.get('/analytics/tokens', { params })
      .then((res) => setTokens(res.data))
      .catch(() => setTokens([]));
  }, [date, spId]);

  useEffect(() => {
    if (!tokenId) { setTimeline(null); return; }
    api.get(`/analytics/tokens/${tokenId}/timeline`)
      .then((res) => setTimeline(res.data))
      .catch(() => setTimeline(null));
  }, [tokenId]);

    const downloadCsv = async (extraParams, filename) => {
    try {
      const params = { ...extraParams };
      if (spId) params.service_point_id = spId;
      const res = await api.get('/analytics/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Could not export the data.');
    }
  };


  const arrivals = (summary?.arrivals_by_hour || []).map((r) => ({
    label: hourLabel(r.hour), value: r.arrivals, wait: num(r.avg_wait_minutes),
  }));
  const throughput = (summary?.throughput_by_hour || []).map((r) => ({
    label: hourLabel(r.hour), value: r.served,
  }));

    const trendRows = trend.map((r) => ({
    label: r.date.slice(5), // MM-DD
    value: num(r.avg_wait_minutes) || 0,
    wait: num(r.avg_wait_minutes),
    served: r.served,
    registered: r.registered,
  }));

  return (
    <div style={S.page}>
      <TopBar subtitle="Manager · Analytics" />
      <div style={S.body}>
        <div style={S.head}>
          <h1 style={S.h1}>Waiting-time analytics</h1>
          <div style={S.filters}>
            <input type="date" style={S.control} value={date} max={today}
              onChange={(e) => setDate(e.target.value)} />
            <select style={S.control} value={spId} onChange={(e) => setSpId(e.target.value)}>
              <option value="">All service points</option>
              {servicePoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
                        <button style={{ ...S.control, cursor: 'pointer', fontWeight: 600 }}
              onClick={() => downloadCsv({ from: date }, `healthqueue_${date}.csv`)}>
              Export this day
            </button>
            <button style={{ ...S.control, cursor: 'pointer', fontWeight: 600 }}
              onClick={() => downloadCsv({ days: 14 }, 'healthqueue_last_14_days.csv')}>
              Export 14 days
            </button>
          </div>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {summary && (
          <>
            <div style={S.grid}>
              <div style={S.stat}>
                <div style={S.statNum}>{summary.patients_served}</div>
                <div style={S.statLabel}>Patients served</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>{fmt(summary.avg_wait_minutes, ' min')}</div>
                <div style={S.statLabel}>Average waiting time</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>{fmt(summary.median_wait_minutes, ' min')}</div>
                <div style={S.statLabel}>Median waiting time</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>{fmt(summary.avg_service_minutes, ' min')}</div>
                <div style={S.statLabel}>Average service time</div>
              </div>
            </div>
            <div style={S.grid}>
              <div style={S.stat}>
                <div style={S.statNum}>{fmt(summary.longest_wait_minutes, ' min')}</div>
                <div style={S.statLabel}>Longest wait</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>
                  {summary.peak_arrival_hour === null ? '—' : hourLabel(summary.peak_arrival_hour)}
                </div>
                <div style={S.statLabel}>Peak arrival hour</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>{summary.total_registered}</div>
                <div style={S.statLabel}>Registered</div>
              </div>
              <div style={S.stat}>
                <div style={S.statNum}>{summary.currently_waiting}</div>
                <div style={S.statLabel}>Still waiting</div>
              </div>
            </div>

            <div style={S.card}>
              <h2 style={S.h2}>Arrivals by hour</h2>
              <p style={S.hint}>How many patients registered in each hour, and their average wait.</p>
              <BarChart rows={arrivals} color="#007AFF"
                valueText={(r) => `${r.value} arrivals · ${fmt(r.wait, ' min')} wait`} />
            </div>

            <div style={S.card}>
              <h2 style={S.h2}>Patients served by hour (throughput)</h2>
              <p style={S.hint}>Consultations completed in each hour.</p>
              <BarChart rows={throughput} color="#34C759"
                valueText={(r) => `${r.value} served`} />
            </div>
          </>
        )}

                <div style={S.card}>
          <h2 style={S.h2}>Waiting-time trend (last 14 days)</h2>
          <p style={S.hint}>
            Average wait per day. Days with no completed consultations show no wait.
          </p>
          <BarChart rows={trendRows} color="#FF9500"
            valueText={(r) => `${fmt(r.wait, ' min')} · ${r.served}/${r.registered} served`} />
        </div>


                <div style={S.card}>
          <h2 style={S.h2}>Token timeline</h2>
          <p style={S.hint}>
            Pick a token to see every recorded event behind its waiting time.
            Uses the date and service point selected above.
          </p>

          <select style={{ ...S.control, width: '100%', marginBottom: 16 }}
            value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
            <option value="">Select a token...</option>
            {tokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.token_number} · {t.status.replace('_', ' ')} · arrived {clock(t.arrival_time).slice(0, 5)}
              </option>
            ))}
          </select>

          {tokens.length === 0 && <div style={S.empty}>No tokens on this date.</div>}

          {timeline && (
            <>
              {timeline.events.map((e, i) => (
                <div key={i} style={S.tlRow}>
                  <div style={S.tlTime}>{clock(e.event_time)}</div>
                  <div style={S.tlLabel}>{EVENT_LABELS[e.event_type] || e.event_type}</div>
                  <div style={S.tlActor}>{e.actor || 'system'}</div>
                </div>
              ))}
              <div style={S.tlSummary}>
                Waited until called: <strong>{fmt(timeline.intervals.wait_until_called_minutes, ' min')}</strong>
                {' + '}call to consultation start: <strong>{fmt(timeline.intervals.call_to_start_minutes, ' min')}</strong>
                <br />
                Total waiting time: <strong>{fmt(timeline.intervals.total_wait_minutes, ' min')}</strong>
                {' · '}Service time: <strong>{fmt(timeline.intervals.service_minutes, ' min')}</strong>
              </div>
            </>
          )}
        </div>

        <div style={S.card}>
          <h2 style={S.h2}>Service point comparison</h2>
          <p style={S.hint}>Selected date, all service points.</p>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Service point</th>
                <th style={S.th}>Registered</th>
                <th style={S.th}>Served</th>
                <th style={S.th}>Avg wait</th>
                <th style={S.th}>Avg service</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.id}>
                  <td style={S.td}>{c.name}</td>
                  <td style={S.td}>{c.total_registered}</td>
                  <td style={S.td}>{c.patients_served}</td>
                  <td style={S.td}>{fmt(c.avg_wait_minutes, ' min')}</td>
                  <td style={S.td}>{fmt(c.avg_service_minutes, ' min')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={S.provenance}>
          <strong>Where these numbers come from.</strong> Every figure is calculated from timestamps
          recorded during each visit. Waiting time = consultation start − arrival time. Service time =
          consultation end − consultation start. Nothing on this screen is typed in by hand.
        </div>
      </div>
    </div>
  );
}