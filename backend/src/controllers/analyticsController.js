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

module.exports = { getSummary, getByServicePoint };