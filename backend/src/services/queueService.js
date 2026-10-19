const MIN_SESSION_COMPLETED = 3;  // proposal 4.4.2: fewer than 3 completed today -> default
const ROLLING_WINDOW = 10;        // proposal 4.4.2: last ten completed service durations

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

// EWT = patients ahead x average service duration
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

  return {
    patients_ahead: patientsAhead,
    avg_service_minutes: Math.round(avg * 10) / 10,
    avg_source: source,
    sample_size,
    ewt_minutes: Math.round(patientsAhead * avg),
  };
};

module.exports = { getAverageServiceMinutes, computeEWT };