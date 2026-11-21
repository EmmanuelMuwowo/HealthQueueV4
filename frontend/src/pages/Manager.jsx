import { useState, useEffect } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, ComposedChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import api from '../services/api';
import TopBar from '../components/TopBar';

// Chart colours: one blue for single-series charts; blue and orange for two series
// (a pair checked for colour-blind separation). Red is kept for "outside the range told".
const C = {
  blue: '#2a78d6', orange: '#eb6834', red: '#e34948', rangeFill: 'rgba(42,120,214,0.18)',
  grid: 'rgba(60,60,67,0.10)', axis: '#6E6E73', ink: '#1D1D1F',
};
const AXIS = { stroke: C.axis, fontSize: 12, tickLine: false, axisLine: false };
// Legend text stays in the normal text colour; the small square carries the series colour
const legendText = (value) => <span style={{ color: C.ink }}>{value}</span>;

const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
const fmt = (v, unit = '') => (num(v) === null || Number.isNaN(num(v)) ? '–' : `${num(v)}${unit}`);
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const clock = (iso) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Lusaka' });

const EVENT_LABELS = {
  arrived: 'Arrived and registered', called: 'Called by clinician', consultation_started: 'Consultation started',
  completed: 'Consultation completed', skipped: 'Skipped (no-show)', recalled: 'Re-queued', cancelled: 'Cancelled',
};

const S = {
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  control: { width: 'auto', minHeight: 40, padding: '8px 12px' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 },
  stat: { background: 'var(--hq-surface)', borderRadius: 'var(--hq-r-group)', padding: '16px 18px', boxShadow: 'var(--hq-shadow)' },
  statNum: { fontFamily: 'var(--hq-font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' },
  card: { marginBottom: 20 },
  two: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 20 },
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 500, color: 'var(--hq-label-2)', borderBottom: '1px solid var(--hq-separator)' },
  td: { padding: '9px 10px', borderBottom: '1px solid rgba(60,60,67,0.08)' },
};

function Stat({ value, label }) {
  return (
    <div style={S.stat}>
      <div className="hq-num" style={S.statNum}>{value}</div>
      <div className="hq-footnote" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ChartCard({ title, hint, children, empty, style }) {
  return (
    <section className="hq-panel" style={{ ...S.card, ...style }}>
      <h2 className="hq-headline">{title}</h2>
      {hint && <p className="hq-caption" style={{ margin: '2px 0 14px' }}>{hint}</p>}
      {empty ? <div className="hq-empty">No data for this selection.</div> : children}
    </section>
  );
}

// One tooltip style for every chart
function Tip({ active, payload, label, render }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid var(--hq-separator)', borderRadius: 10, padding: '8px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.10)', fontSize: 13 }}>
      {render(payload[0].payload, label)}
    </div>
  );
}
const TipRow = ({ name, value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
    {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />}
    <span style={{ color: 'var(--hq-label-2)' }}>{name}</span>
    <span className="hq-num" style={{ marginLeft: 'auto', paddingLeft: 12, fontWeight: 600, color: C.ink }}>{value}</span>
  </div>
);

export default function Manager() {
  const today = new Date().toLocaleDateString('en-CA');
  const [trend, setTrend] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [tokenId, setTokenId] = useState('');
  const [timeline, setTimeline] = useState(null);
  const [date, setDate] = useState(today);
  const [spId, setSpId] = useState('');
  const [servicePoints, setServicePoints] = useState([]);
  const [summary, setSummary] = useState(null);
  const [compare, setCompare] = useState([]);
  const [byType, setByType] = useState([]);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/visits/service-points').then((res) => setServicePoints(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { date };
    if (spId) params.service_point_id = spId;
    setError('');
    api.get('/analytics/summary', { params }).then((res) => setSummary(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load analytics.'));
    api.get('/analytics/service-points', { params: { date } }).then((res) => setCompare(res.data)).catch(() => {});
    api.get('/analytics/visit-types', { params }).then((res) => setByType(res.data)).catch(() => setByType([]));
    api.get('/analytics/ewt-accuracy', { params }).then((res) => setAccuracy(res.data)).catch(() => setAccuracy(null));
  }, [date, spId]);

  useEffect(() => {
    const params = { days: 14 };
    if (spId) params.service_point_id = spId;
    api.get('/analytics/trend', { params }).then((res) => setTrend(res.data.rows)).catch(() => {});
  }, [spId]);

  useEffect(() => {
    const params = { date };
    if (spId) params.service_point_id = spId;
    setTokenId(''); setTimeline(null);
    api.get('/analytics/tokens', { params }).then((res) => setTokens(res.data)).catch(() => setTokens([]));
  }, [date, spId]);

  useEffect(() => {
    if (!tokenId) { setTimeline(null); return; }
    api.get(`/analytics/tokens/${tokenId}/timeline`).then((res) => setTimeline(res.data)).catch(() => setTimeline(null));
  }, [tokenId]);

  const downloadCsv = async (extraParams, filename) => {
    try {
      const params = { ...extraParams };
      if (spId) params.service_point_id = spId;
      const res = await api.get('/analytics/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Could not export the data.');
    }
  };

  // ---- Chart data ----
  const hours = {};
  (summary?.arrivals_by_hour || []).forEach((r) => {
    hours[r.hour] = { ...(hours[r.hour] || {}), hour: r.hour, arrivals: r.arrivals, wait: num(r.avg_wait_minutes) };
  });
  (summary?.throughput_by_hour || []).forEach((r) => {
    hours[r.hour] = { ...(hours[r.hour] || {}), hour: r.hour, served: r.served };
  });
  const hourly = Object.values(hours).sort((a, b) => a.hour - b.hour)
    .map((h) => ({ label: hourLabel(h.hour), arrivals: h.arrivals || 0, served: h.served || 0, wait: h.wait }));

  const trendRows = trend.map((r) => ({
    label: new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    wait: num(r.avg_wait_minutes), served: r.served, registered: r.registered,
  }));
  const trendHasData = trendRows.some((r) => r.wait !== null);

  const compareRows = compare.map((c) => ({
    name: c.name, wait: num(c.avg_wait_minutes) ?? 0, hasWait: num(c.avg_wait_minutes) !== null,
    service: num(c.avg_service_minutes), registered: c.total_registered, served: c.patients_served,
  }));

  const typeRows = byType.map((c) => ({
    name: spId ? c.visit_type : `${c.visit_type} (${c.service_point})`,
    service: num(c.avg_service_minutes), def: num(c.default_minutes),
    wait: num(c.avg_wait_minutes), registered: c.registered, served: c.served,
  }));

  const accRows = (accuracy?.rows || []).slice(0, 40).map((r) => ({
    token: r.token_number, range: [num(r.ewt_low), num(r.ewt_high)], actual: num(r.actual_minutes),
    inside: r.within_range, error: num(r.error_minutes), urgent: r.priority === 'urgent', type: r.visit_type,
  }));

  const barH = (n) => Math.max(140, n * 44 + 40);

  return (
    <div>
      <TopBar subtitle="Analytics" />
      <main className="hq-page">
        <div className="hq-page-header">
          <div>
            <h1 className="hq-large-title">Waiting-time analytics</h1>
            <p className="hq-footnote" style={{ margin: '6px 0 0' }}>Every figure is calculated from times recorded during each visit.</p>
          </div>
          <div style={S.filters}>
            <input type="date" className="hq-input" style={S.control} value={date} max={today}
              aria-label="Date" onChange={(e) => setDate(e.target.value)} />
            <select className="hq-select" style={S.control} value={spId} aria-label="Service point"
              onChange={(e) => setSpId(e.target.value)}>
              <option value="">All service points</option>
              {servicePoints.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
            <button type="button" className="hq-btn hq-btn-secondary" onClick={() => downloadCsv({ from: date }, `healthqueue_${date}.csv`)}>
              Export day
            </button>
            <button type="button" className="hq-btn hq-btn-secondary" onClick={() => downloadCsv({ days: 14 }, 'healthqueue_last_14_days.csv')}>
              Export 14 days
            </button>
          </div>
        </div>

        {error && <div className="hq-notice is-error" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

        {summary && (
          <div style={S.stats}>
            <Stat value={summary.patients_served} label="Patients served" />
            <Stat value={fmt(summary.avg_wait_minutes, ' min')} label="Average wait" />
            <Stat value={fmt(summary.median_wait_minutes, ' min')} label="Median wait" />
            <Stat value={fmt(summary.longest_wait_minutes, ' min')} label="Longest wait" />
            <Stat value={fmt(summary.avg_service_minutes, ' min')} label="Average consultation" />
            <Stat value={summary.peak_arrival_hour === null ? '–' : hourLabel(summary.peak_arrival_hour)} label="Busiest arrival hour" />
            <Stat value={summary.total_registered} label="Registered" />
            <Stat value={summary.currently_waiting} label="Still waiting" />
          </div>
        )}

        <ChartCard title="Arrivals and patients served by hour"
          hint="Arrivals = patients registered in that hour. Served = consultations completed in that hour. Hover a bar for the average wait."
          empty={hourly.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourly} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => (
                <Tip {...p} render={(d) => (<>
                  <div style={{ fontWeight: 600 }}>{d.label}</div>
                  <TipRow name="Arrivals" value={d.arrivals} color={C.blue} />
                  <TipRow name="Served" value={d.served} color={C.orange} />
                  <TipRow name="Average wait of arrivals" value={fmt(d.wait, ' min')} />
                </>)} />
              )} />
              <Legend iconType="square" iconSize={10} formatter={legendText} wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="arrivals" name="Arrivals" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Bar dataKey="served" name="Served" fill={C.orange} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Average waiting time, last 14 days"
          hint="Average minutes from arrival to the start of the consultation, per day. Days with no completed consultations are left blank."
          empty={!trendHasData}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trendRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
              <YAxis {...AXIS} unit=" m" />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => (
                <Tip {...p} render={(d) => (<>
                  <div style={{ fontWeight: 600 }}>{d.label}</div>
                  <TipRow name="Average wait" value={fmt(d.wait, ' min')} color={C.blue} />
                  <TipRow name="Served / registered" value={`${d.served} / ${d.registered}`} />
                </>)} />
              )} />
              <Bar dataKey="wait" name="Average wait" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div style={S.two}>
          <ChartCard title="Average wait by service point" hint="Selected date, all service points." style={{ marginBottom: 0 }}
            empty={compareRows.length === 0}>
            <ResponsiveContainer width="100%" height={barH(compareRows.length)}>
              <BarChart data={compareRows} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" {...AXIS} unit=" m" />
                <YAxis type="category" dataKey="name" {...AXIS} width={130} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => (
                  <Tip {...p} render={(d) => (<>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <TipRow name="Average wait" value={d.hasWait ? `${d.wait} min` : '–'} color={C.blue} />
                    <TipRow name="Average consultation" value={fmt(d.service, ' min')} />
                    <TipRow name="Served / registered" value={`${d.served} / ${d.registered}`} />
                  </>)} />
                )} />
                <Bar dataKey="wait" name="Average wait" fill={C.blue} radius={[0, 4, 4, 0]} maxBarSize={26}
                  label={({ x, y, width, height, value }) => (value
                    ? <text x={x + width + 6} y={y + height / 2} dy={4} fontSize={12} fill={C.ink}>{value} min</text>
                    : null)} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Consultation time by visit type"
            hint="Measured average against the default time used before 3 consultations are recorded." style={{ marginBottom: 0 }}
            empty={typeRows.length === 0}>
            <ResponsiveContainer width="100%" height={barH(typeRows.length) + 30}>
              <BarChart data={typeRows} layout="vertical" barGap={2} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={C.grid} />
                <XAxis type="number" {...AXIS} unit=" m" />
                <YAxis type="category" dataKey="name" {...AXIS} width={190} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => (
                  <Tip {...p} render={(d) => (<>
                    <div style={{ fontWeight: 600 }}>{d.name}</div>
                    <TipRow name="Measured average" value={fmt(d.service, ' min')} color={C.blue} />
                    <TipRow name="Default time" value={fmt(d.def, ' min')} color={C.orange} />
                    <TipRow name="Average wait" value={fmt(d.wait, ' min')} />
                    <TipRow name="Served / registered" value={`${d.served} / ${d.registered}`} />
                  </>)} />
                )} />
                <Legend iconType="square" iconSize={10} formatter={legendText} wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="service" name="Measured average" fill={C.blue} radius={[0, 4, 4, 0]} maxBarSize={14} />
                <Bar dataKey="def" name="Default time" fill={C.orange} radius={[0, 4, 4, 0]} maxBarSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Waiting-time estimate accuracy"
          hint="Shaded bar = the range each patient was told at registration. Dot = how long they actually waited. A hollow red dot means the wait fell outside the range. Re-queued patients are left out."
          empty={!accuracy || accuracy.evaluated === 0}>
          {accuracy && accuracy.evaluated > 0 && (
            <>
              <div style={{ ...S.stats, marginBottom: 12 }}>
                <Stat value={accuracy.evaluated} label="Patients evaluated" />
                <Stat value={fmt(accuracy.within_range_percent, '%')} label="Waited inside the range told" />
                <Stat value={fmt(accuracy.mean_absolute_error_minutes, ' min')} label="Average error" />
                <Stat value={fmt(accuracy.within_5_minutes_percent, '%')} label="Within 5 min of the estimate" />
              </div>
              <p className="hq-footnote" style={{ margin: '0 0 10px' }}>
                On average patients waited{' '}
                {num(accuracy.mean_error_minutes) >= 0
                  ? `${fmt(accuracy.mean_error_minutes, ' min')} longer`
                  : `${fmt(Math.abs(num(accuracy.mean_error_minutes)), ' min')} less`}{' '}
                than the estimate.
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={accRows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} />
                  <XAxis dataKey="token" {...AXIS} interval={0} angle={accRows.length > 12 ? -40 : 0}
                    textAnchor={accRows.length > 12 ? 'end' : 'middle'} height={accRows.length > 12 ? 50 : 30} />
                  <YAxis {...AXIS} unit=" m" />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={(p) => (
                    <Tip {...p} render={(d) => (<>
                      <div style={{ fontWeight: 600 }}>{d.token}{d.urgent ? ' (urgent)' : ''}</div>
                      <div className="hq-caption">{d.type}</div>
                      <TipRow name="Told" value={`${d.range[0]}–${d.range[1]} min`} color={C.rangeFill} />
                      <TipRow name="Actual wait" value={`${d.actual} min`} />
                      <TipRow name="Result" value={d.inside ? 'Inside the range' : 'Outside the range'} />
                    </>)} />
                  )} />
                  <Bar dataKey="range" name="Range told" fill={C.rangeFill} radius={4} maxBarSize={28} />
                  <Scatter dataKey="actual" name="Actual wait" shape={(props) => {
                    const { cx, cy, payload } = props;
                    if (cx == null || cy == null) return null;
                    return payload.inside
                      ? <circle cx={cx} cy={cy} r={5} fill={C.ink} stroke="#fff" strokeWidth={2} />
                      : <circle cx={cx} cy={cy} r={5} fill="#fff" stroke={C.red} strokeWidth={2.5} />;
                  }}>
                    {accRows.map((r) => <Cell key={r.token} />)}
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
              <details style={{ marginTop: 12 }}>
                <summary className="hq-footnote" style={{ cursor: 'pointer' }}>Show as a table</summary>
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead><tr>
                      <th style={S.th}>Token</th><th style={S.th}>Visit type</th><th style={S.th}>Told</th>
                      <th style={S.th}>Actual</th><th style={S.th}>Difference</th>
                    </tr></thead>
                    <tbody>
                      {accRows.map((r) => (
                        <tr key={r.token}>
                          <td style={S.td}>{r.token}{r.urgent && <span className="hq-pill is-red" style={{ marginLeft: 6 }}>Urgent</span>}</td>
                          <td style={S.td}>{r.type}</td>
                          <td style={S.td} className="hq-num">{r.range[0]}–{r.range[1]} min</td>
                          <td style={S.td} className="hq-num">{r.actual} min {r.inside ? '' : <span className="hq-pill is-red">Outside</span>}</td>
                          <td style={S.td} className="hq-num">{r.error > 0 ? '+' : ''}{r.error} min</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </ChartCard>

        <ChartCard title="Token timeline" hint="Pick a token to see every recorded event behind its waiting time. Uses the date and service point above.">
          <select className="hq-select" value={tokenId} aria-label="Token" onChange={(e) => setTokenId(e.target.value)}
            style={{ marginBottom: 14 }}>
            <option value="">Select a token…</option>
            {tokens.map((t) => (
              <option key={t.id} value={t.id}>
                {t.token_number}, {t.status.replace('_', ' ')}, arrived {clock(t.arrival_time).slice(0, 5)}
              </option>
            ))}
          </select>
          {tokens.length === 0 && <div className="hq-empty">No tokens on this date.</div>}
          {timeline && (
            <>
              {(timeline.token.referred_from || timeline.token.referred_to) && (
                <p className="hq-caption" style={{ margin: '0 0 8px' }}>
                  {timeline.token.referred_from ? `Referred from ${timeline.token.referred_from}. ` : ''}
                  {timeline.token.referred_to ? `Referred on to ${timeline.token.referred_to}.` : ''}
                </p>
              )}
              <div className="hq-group">
                {timeline.events.map((e, i) => (
                  <div key={i} className="hq-row">
                    <span className="hq-num" style={{ fontWeight: 600, color: 'var(--hq-blue)', width: 80 }}>{clock(e.event_time)}</span>
                    <span style={{ flex: 1 }}>{EVENT_LABELS[e.event_type] || e.event_type}</span>
                    <span className="hq-footnote">{e.actor || 'system'}</span>
                  </div>
                ))}
              </div>
              <div className="hq-group" style={{ marginTop: 12 }}>
                <div className="hq-row"><span>Waited until called</span><span className="hq-row-value hq-num">{fmt(timeline.intervals.wait_until_called_minutes, ' min')}</span></div>
                <div className="hq-row"><span>Called to consultation start</span><span className="hq-row-value hq-num">{fmt(timeline.intervals.call_to_start_minutes, ' min')}</span></div>
                <div className="hq-row"><strong>Total waiting time</strong><strong className="hq-num">{fmt(timeline.intervals.total_wait_minutes, ' min')}</strong></div>
                <div className="hq-row"><span>Consultation time</span><span className="hq-row-value hq-num">{fmt(timeline.intervals.service_minutes, ' min')}</span></div>
              </div>
            </>
          )}
        </ChartCard>

        <section className="hq-notice is-info" style={{ lineHeight: 1.6 }}>
          <strong>Where these numbers come from.</strong> Waiting time = consultation start − arrival time.
          Consultation time = consultation end − consultation start. Nothing on this screen is typed in by hand.
        </section>
      </main>
    </div>
  );
}
