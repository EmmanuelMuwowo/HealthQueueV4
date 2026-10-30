const MIN_SESSION_COMPLETED = 3;  // proposal 4.4.2: fewer than 3 completed today -> default
const ROLLING_WINDOW = 10;        // proposal 4.4.2: last ten completed service durations

const round1 = (n) => Math.round(n * 10) / 10;

// Average service duration in minutes for a service point.
const getAverageServiceMinutes = async (db, servicePointId) => {
  const spRes = await db.query(
    'SELECT default_service_minutes FROM service_points WHERE id = $1',
    [servicePointId]
  );
  const fallback = spRes.rows[0]?.default_service_minutes ?? 8;

  // How many consultations were completed in today's session?
  const todayRes = await db.query(
    `SELECT COUNT(*)::int AS n FROM queue_tokens
     WHERE service_point_id = $1
       AND queue_date = CURRENT_DATE
       AND status = 'completed'
       AND consultation_start IS NOT NULL
       AND consultation_end IS NOT NULL`,
    [servicePointId]
  );
  const completedToday = todayRes.rows[0].n;

  // The last ten completed durations at this service point
  const res = await db.query(
    `SELECT EXTRACT(EPOCH FROM (consultation_end - consultation_start)) / 60 AS minutes
     FROM queue_tokens
     WHERE service_point_id = $1
       AND status = 'completed'
       AND consultation_start IS NOT NULL
       AND consultation_end IS NOT NULL
     ORDER BY consultation_end DESC
     LIMIT $2`,
    [servicePointId, ROLLING_WINDOW]
  );

  if (completedToday < MIN_SESSION_COMPLETED || res.rows.length === 0) {
    return { avg: fallback, source: 'default', sample_size: completedToday };
  }
  const sum = res.rows.reduce((a, r) => a + parseFloat(r.minutes), 0);
  return { avg: sum / res.rows.length, source: 'rolling_average', sample_size: res.rows.length };
};

// EWT for someone with `ahead` patients in front of them.
// If one of those is already in consultation, only their remaining time counts.
const estimateWait = ({ ahead, avg, consultationStart, now = Date.now() }) => {
  if (!consultationStart || ahead === 0) {
    return { ewt: ahead * avg, elapsed: null, remaining: null };
  }
  const elapsed = Math.max(0, (now - new Date(consultationStart).getTime()) / 60000);
  const remaining = Math.max(0, avg - elapsed);
  return { ewt: remaining + (ahead - 1) * avg, elapsed, remaining };
};

// EWT for one token
const computeEWT = async (db, token) => {
  const aheadRes = await db.query(
    `SELECT COUNT(*) FROM queue_tokens
     WHERE service_point_id = $1
       AND queue_date = $2
       AND id <> $3
       AND (
         status IN ('called', 'in_consultation')
         OR (
           status = 'waiting'
           AND (
             (priority = 'urgent' AND $4 = 'normal')
             OR (priority = $4 AND sequence_no < $5)
           )
         )
       )`,
    [token.service_point_id, token.queue_date, token.id, token.priority, token.sequence_no]
  );
  const patientsAhead = parseInt(aheadRes.rows[0].count);
  const { avg, source, sample_size } = await getAverageServiceMinutes(db, token.service_point_id);

  const current = await db.query(
    `SELECT consultation_start FROM queue_tokens
     WHERE service_point_id = $1
       AND queue_date = $2
       AND status = 'in_consultation'
       AND id <> $3
     ORDER BY consultation_start
     LIMIT 1`,
    [token.service_point_id, token.queue_date, token.id]
  );
  const est = estimateWait({
    ahead: patientsAhead, avg, consultationStart: current.rows[0]?.consultation_start,
  });

  return {
    patients_ahead: patientsAhead,
    avg_service_minutes: round1(avg),
    avg_source: source,
    sample_size,
    current_elapsed_minutes: est.elapsed === null ? null : round1(est.elapsed),
    current_remaining_minutes: est.remaining === null ? null : round1(est.remaining),
    ewt_minutes: Math.round(est.ewt),
  };
};

module.exports = { getAverageServiceMinutes, estimateWait, computeEWT };