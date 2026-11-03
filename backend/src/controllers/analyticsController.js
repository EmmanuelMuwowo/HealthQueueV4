const pool = require('../db');

const TZ = 'Africa/Lusaka';

// GET /api/analytics/summary?service_point_id=1&date=2026-10-06
// Both params are optional: no service point = whole clinic, no date = today.
const getSummary = async (req, res) => {
  try {
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;
    const date = req.query.date || null;
    const params = [sp, date];
    const scope = `queue_date = COALESCE($2::date, CURRENT_DATE)
                   AND ($1::int IS NULL OR service_point_id = $1)`;

    // Wait = arrival to consultation start. Service = consultation start to end.
    const summary = await pool.query(
      `SELECT
         COUNT(*) AS total_registered,
         COUNT(*) FILTER (WHERE status = 'completed') AS patients_served,
         COUNT(*) FILTER (WHERE status = 'waiting') AS currently_waiting,
         COUNT(*) FILTER (WHERE status IN ('called', 'in_consultation')) AS in_progress,
         COUNT(*) FILTER (WHERE status IN ('skipped', 'cancelled')) AS skipped_or_cancelled,
         ROUND((AVG(EXTRACT(EPOCH FROM (consultation_start - arrival_time)) / 60)
           FILTER (WHERE consultation_start IS NOT NULL))::numeric, 1) AS avg_wait_minutes,
                  ROUND((percentile_cont(0.5) WITHIN GROUP
           (ORDER BY (EXTRACT(EPOCH FROM (consultation_start - arrival_time)) / 60)::double precision)
           FILTER (WHERE consultation_start IS NOT NULL))::numeric, 1) AS median_wait_minutes,
         ROUND((MAX(EXTRACT(EPOCH FROM (consultation_start - arrival_time)) / 60)
           FILTER (WHERE consultation_start IS NOT NULL))::numeric, 1) AS longest_wait_minutes,
         ROUND((AVG(EXTRACT(EPOCH FROM (consultation_end - consultation_start)) / 60)
           FILTER (WHERE consultation_end IS NOT NULL))::numeric, 1) AS avg_service_minutes
       FROM queue_tokens
       WHERE ${scope}`,
      params
    );

    const arrivals = await pool.query(
      `SELECT EXTRACT(HOUR FROM arrival_time AT TIME ZONE '${TZ}')::int AS hour,
              COUNT(*)::int AS arrivals,
              ROUND((AVG(EXTRACT(EPOCH FROM (consultation_start - arrival_time)) / 60)
                FILTER (WHERE consultation_start IS NOT NULL))::numeric, 1) AS avg_wait_minutes
       FROM queue_tokens
       WHERE ${scope}
       GROUP BY hour ORDER BY hour`,
      params
    );

    const throughput = await pool.query(
      `SELECT EXTRACT(HOUR FROM consultation_end AT TIME ZONE '${TZ}')::int AS hour,
              COUNT(*)::int AS served
       FROM queue_tokens
       WHERE ${scope} AND status = 'completed'
       GROUP BY hour ORDER BY hour`,
      params
    );

    const peak = arrivals.rows.reduce(
      (best, r) => (!best || r.arrivals > best.arrivals ? r : best), null
    );

    res.json({
      scope: { service_point_id: sp, date: date || 'today' },
      ...summary.rows[0],
      peak_arrival_hour: peak ? peak.hour : null,
      arrivals_by_hour: arrivals.rows,
      throughput_by_hour: throughput.rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/analytics/service-points : comparison across all service points
const getByServicePoint = async (req, res) => {
  try {
    const date = req.query.date || null;
    const result = await pool.query(
      `SELECT sp.id, sp.name, sp.code,
         COUNT(qt.id)::int AS total_registered,
         COUNT(qt.id) FILTER (WHERE qt.status = 'completed')::int AS patients_served,
         COUNT(qt.id) FILTER (WHERE qt.status = 'waiting')::int AS currently_waiting,
         ROUND((AVG(EXTRACT(EPOCH FROM (qt.consultation_start - qt.arrival_time)) / 60)
           FILTER (WHERE qt.consultation_start IS NOT NULL))::numeric, 1) AS avg_wait_minutes,
         ROUND((AVG(EXTRACT(EPOCH FROM (qt.consultation_end - qt.consultation_start)) / 60)
           FILTER (WHERE qt.consultation_end IS NOT NULL))::numeric, 1) AS avg_service_minutes
       FROM service_points sp
       LEFT JOIN queue_tokens qt
         ON qt.service_point_id = sp.id
        AND qt.queue_date = COALESCE($1::date, CURRENT_DATE)
       WHERE sp.is_active = TRUE
       GROUP BY sp.id, sp.name, sp.code
       ORDER BY sp.id`,
      [date]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/analytics/trend?days=14&service_point_id=1
// One row per day that had visits: registered, served, average wait and service time.
const getTrend = async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 90);
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;

    const result = await pool.query(
      `SELECT queue_date::text AS date,
         COUNT(*)::int AS registered,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS served,
         ROUND((AVG(EXTRACT(EPOCH FROM (consultation_start - arrival_time)) / 60)
           FILTER (WHERE consultation_start IS NOT NULL))::numeric, 1) AS avg_wait_minutes,
         ROUND((AVG(EXTRACT(EPOCH FROM (consultation_end - consultation_start)) / 60)
           FILTER (WHERE consultation_end IS NOT NULL))::numeric, 1) AS avg_service_minutes
       FROM queue_tokens
       WHERE queue_date >= CURRENT_DATE - ($1::int - 1)
         AND ($2::int IS NULL OR service_point_id = $2)
       GROUP BY queue_date
       ORDER BY queue_date`,
      [days, sp]
    );
    res.json({ days, service_point_id: sp, rows: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const minutesBetween = (a, b) =>
  a && b ? Math.round(((new Date(b) - new Date(a)) / 60000) * 10) / 10 : null;

// GET /api/analytics/tokens?date=YYYY-MM-DD&service_point_id=1  (defaults to today)
const listTokens = async (req, res) => {
  try {
    const date = req.query.date || null;
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;
    const result = await pool.query(
      `SELECT qt.id, qt.token_number, qt.priority, qt.status, qt.arrival_time,
              sp.name AS service_point
       FROM queue_tokens qt
       JOIN service_points sp ON sp.id = qt.service_point_id
       WHERE qt.queue_date = COALESCE($1::date, CURRENT_DATE)
         AND ($2::int IS NULL OR qt.service_point_id = $2)
       ORDER BY qt.arrival_time`,
      [date, sp]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/analytics/tokens/:id/timeline : every recorded event for one token.
// No patient name: analytics works on tokens, not on people.
const getTokenTimeline = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tok = await pool.query(
      `SELECT qt.id, qt.token_number, qt.priority, qt.status,
              qt.queue_date::text AS date, sp.name AS service_point
       FROM queue_tokens qt
       JOIN service_points sp ON sp.id = qt.service_point_id
       WHERE qt.id = $1`,
      [id]
    );
    if (tok.rows.length === 0) return res.status(404).json({ error: 'Token not found' });

    const ev = await pool.query(
      `SELECT e.event_type, e.event_time, s.full_name AS actor
       FROM event_log e
       LEFT JOIN staff s ON s.id = e.actor_id
       WHERE e.token_id = $1
       ORDER BY e.event_time, e.id`,
      [id]
    );
    const events = ev.rows;
    const reversed = [...events].reverse();

    const arrived = events.find((e) => e.event_type === 'arrived')?.event_time;
    const started = reversed.find((e) => e.event_type === 'consultation_started')?.event_time;
    const completed = reversed.find((e) => e.event_type === 'completed')?.event_time;
    // The call that led to the consultation (a token can be called, skipped and re-queued)
    const called = started
      ? reversed.find((e) => e.event_type === 'called' && new Date(e.event_time) <= new Date(started))?.event_time
      : reversed.find((e) => e.event_type === 'called')?.event_time;

    res.json({
      token: tok.rows[0],
      events,
      intervals: {
        wait_until_called_minutes: minutesBetween(arrived, called),
        call_to_start_minutes: minutesBetween(called, started),
        total_wait_minutes: minutesBetween(arrived, started),
        service_minutes: minutesBetween(started, completed),
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const EXPORT_COLUMNS = [
  'date', 'token', 'service_point', 'visit_type', 'priority', 'status',
  'arrived', 'called', 'consultation_start', 'consultation_end',
  'wait_minutes', 'service_minutes',
];

// GET /api/analytics/export?from=YYYY-MM-DD&to=YYYY-MM-DD&days=14&service_point_id=1
// One row per token. No patient names or phone numbers, and times are Lusaka local time.
// wait_minutes = arrival to consultation start, the same definition as the dashboard.
const exportCsv = async (req, res) => {
  try {
    const from = req.query.from || null;
    const to = req.query.to || null;
    const isDate = (s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!isDate(from) || !isDate(to)) {
      return res.status(400).json({ error: 'Dates must look like 2026-10-27' });
    }
    const days = req.query.days
      ? Math.min(Math.max(parseInt(req.query.days) || 1, 1), 90)
      : null;
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;

    const result = await pool.query(
      `SELECT qt.queue_date::text AS date,
         qt.token_number AS token,
         sp.name AS service_point,
         v.visit_type,
         qt.priority,
         qt.status,
         to_char(qt.arrival_time AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS') AS arrived,
         to_char(qt.called_time AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS') AS called,
         to_char(qt.consultation_start AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS') AS consultation_start,
         to_char(qt.consultation_end AT TIME ZONE '${TZ}', 'YYYY-MM-DD HH24:MI:SS') AS consultation_end,
         ROUND((EXTRACT(EPOCH FROM (qt.consultation_start - qt.arrival_time)) / 60)::numeric, 1) AS wait_minutes,
         ROUND((EXTRACT(EPOCH FROM (qt.consultation_end - qt.consultation_start)) / 60)::numeric, 1) AS service_minutes
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       JOIN service_points sp ON sp.id = qt.service_point_id
       WHERE qt.queue_date >= CASE WHEN $3::int IS NOT NULL
               THEN CURRENT_DATE - ($3::int - 1)
               ELSE COALESCE($1::date, CURRENT_DATE) END
         AND qt.queue_date <= CASE WHEN $3::int IS NOT NULL
               THEN CURRENT_DATE
               ELSE COALESCE($2::date, $1::date, CURRENT_DATE) END
         AND ($4::int IS NULL OR qt.service_point_id = $4)
       ORDER BY qt.queue_date, qt.arrival_time`,
      [from, to, days, sp]
    );

    const lines = result.rows.map((r) => EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(','));
    const csv = [EXPORT_COLUMNS.join(','), ...lines].join('\r\n') + '\r\n';

    const label = (days ? `last_${days}_days` : `${from || 'today'}${to && to !== from ? `_to_${to}` : ''}`)
      .replace(/[^0-9A-Za-z_-]/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="healthqueue_${label}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Date scope shared by the two reports below:
// ?days=N  -> the last N days (for the evaluation in the report)
// ?date=YYYY-MM-DD -> one day (default today)
const dateScope = (req) => {
  const days = req.query.days ? Math.min(Math.max(parseInt(req.query.days) || 1, 1), 90) : null;
  const date = req.query.date || null;
  return { days, date };
};
const DATE_SQL = `qt.queue_date >= CASE WHEN $1::int IS NOT NULL
                    THEN CURRENT_DATE - ($1::int - 1) ELSE COALESCE($2::date, CURRENT_DATE) END
                  AND qt.queue_date <= CASE WHEN $1::int IS NOT NULL
                    THEN CURRENT_DATE ELSE COALESCE($2::date, CURRENT_DATE) END`;

// GET /api/analytics/visit-types?date=YYYY-MM-DD&service_point_id=1  (or ?days=N)
// Volume, wait and service time per visit type.
const getByCategory = async (req, res) => {
  try {
    const { days, date } = dateScope(req);
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;
    const result = await pool.query(
      `SELECT sp.name AS service_point,
         COALESCE(vc.name, 'Not set') AS visit_type,
         vc.default_minutes::float AS default_minutes,
         COUNT(qt.id)::int AS registered,
         COUNT(qt.id) FILTER (WHERE qt.status = 'completed')::int AS served,
         ROUND((AVG(EXTRACT(EPOCH FROM (qt.consultation_start - qt.arrival_time)) / 60)
           FILTER (WHERE qt.consultation_start IS NOT NULL))::numeric, 1) AS avg_wait_minutes,
         ROUND((AVG(EXTRACT(EPOCH FROM (qt.consultation_end - qt.consultation_start)) / 60)
           FILTER (WHERE qt.consultation_end IS NOT NULL))::numeric, 1) AS avg_service_minutes
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       JOIN service_points sp ON sp.id = qt.service_point_id
       LEFT JOIN visit_categories vc ON vc.id = v.category_id
       WHERE ${DATE_SQL}
         AND ($3::int IS NULL OR qt.service_point_id = $3)
       GROUP BY sp.id, sp.name, vc.id, vc.name, vc.default_minutes, vc.sort_order
       ORDER BY sp.id, vc.sort_order NULLS LAST`,
      [days, date, sp]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

// GET /api/analytics/ewt-accuracy?date=YYYY-MM-DD&service_point_id=1  (or ?days=N)
// Compares the wait each patient was told at registration with the wait they actually had.
// Actual wait = consultation start - arrival time (the same definition as the dashboard).
// Re-queued tokens are left out: their wait includes time after a no-show, which no estimate covers.
const getEwtAccuracy = async (req, res) => {
  try {
    const { days, date } = dateScope(req);
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;
    const result = await pool.query(
      `SELECT qt.id, qt.token_number, qt.priority, qt.queue_date::text AS date,
         sp.name AS service_point,
         COALESCE(vc.name, 'Not set') AS visit_type,
         qt.ewt_at_registration::float AS predicted,
         qt.ewt_low::float AS ewt_low, qt.ewt_high::float AS ewt_high,
         EXTRACT(EPOCH FROM (qt.consultation_start - qt.arrival_time))::float / 60 AS actual
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       JOIN service_points sp ON sp.id = qt.service_point_id
       LEFT JOIN visit_categories vc ON vc.id = v.category_id
       WHERE ${DATE_SQL}
         AND ($3::int IS NULL OR qt.service_point_id = $3)
         AND qt.consultation_start IS NOT NULL
         AND qt.ewt_at_registration IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM event_log e WHERE e.token_id = qt.id AND e.event_type = 'recalled'
         )
       ORDER BY qt.queue_date, qt.arrival_time`,
      [days, date, sp]
    );

    const rows = result.rows.map((r) => {
      const error = r.actual - r.predicted; // positive = waited longer than told
      return {
        id: r.id,
        date: r.date,
        token_number: r.token_number,
        service_point: r.service_point,
        visit_type: r.visit_type,
        priority: r.priority,
        predicted_minutes: round1(r.predicted),
        ewt_low: r.ewt_low,
        ewt_high: r.ewt_high,
        actual_minutes: round1(r.actual),
        error_minutes: round1(error),
        within_range: r.ewt_low !== null && r.ewt_high !== null
          && r.actual >= r.ewt_low && r.actual <= r.ewt_high,
        within_5_minutes: Math.abs(error) <= 5,
      };
    });

    const n = rows.length;
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    res.json({
      scope: { days, date: days ? null : (date || 'today'), service_point_id: sp },
      evaluated: n,
      mean_absolute_error_minutes: n ? round1(sum((r) => Math.abs(r.error_minutes)) / n) : null,
      mean_error_minutes: n ? round1(sum((r) => r.error_minutes) / n) : null,
      within_range_percent: pct(rows.filter((r) => r.within_range).length, n),
      within_5_minutes_percent: pct(rows.filter((r) => r.within_5_minutes).length, n),
      rows,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getSummary, getByServicePoint, getTrend, listTokens, getTokenTimeline, exportCsv,
  getByCategory, getEwtAccuracy,
};