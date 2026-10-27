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

module.exports = { getSummary, getByServicePoint, getTrend, listTokens, getTokenTimeline };