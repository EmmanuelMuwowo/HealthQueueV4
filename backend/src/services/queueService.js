// HealthQueue EWT engine.
//
// EWT = ( sum of expected times of everyone ahead / active clinicians ) x (1 + buffer)
//
// Expected time per visit category = EWMA of its last 10 completed consultations
// (past 30 days), or the category's default until 3 have been completed.

const ALPHA = 0.3;          // weight of the newest consultation in the EWMA
const MIN_COMPLETED = 3;    // below this, the category default is used
const WINDOW = 10;          // number of recent consultations considered
const HISTORY_DAYS = 30;    // how far back to look
const OVERRUN_SHARE = 0.2;  // an overrunning consultation still counts 20% of its AHT
// Data cleaning: durations outside this range are treated as recording errors
// (Start and Complete pressed together, or Complete pressed hours late)
// and are not used for average handling time.
const MIN_VALID_MINUTES = 1;
const MAX_VALID_MINUTES = 60;

const round1 = (n) => Math.round(n * 10) / 10;

// ---- Pure functions (unit tested, no database) ----

// values ordered oldest to newest
const ewma = (values, alpha = ALPHA) =>
  values.reduce((acc, x, i) => (i === 0 ? x : alpha * x + (1 - alpha) * acc), 0);

const categoryAHT = (defaultMinutes, recent) =>
  (recent.length >= MIN_COMPLETED
    ? { aht: ewma(recent), source: 'ewma', sample_size: recent.length }
    : { aht: defaultMinutes, source: 'default', sample_size: recent.length });

const remainingMinutes = (aht, elapsed) => Math.max(aht - elapsed, OVERRUN_SHARE * aht);

// 80% to 130% of the estimate, rounded outwards to 5 minutes
const band = (ewt) => {
  if (ewt < 1) return { ewt_low: 0, ewt_high: 5 };
  const low = Math.max(0, Math.floor((ewt * 0.8) / 5) * 5);
  let high = Math.ceil((ewt * 1.3) / 5) * 5;
  if (high <= low) high = low + 5;
  return { ewt_low: low, ewt_high: high };
};

// tokens must already be in queue order: active first, then urgent, then first come
const estimateFromQueue = ({ tokens, ahtFor, clinicians = 1, buffer = 0, now = Date.now() }) => {
  const out = new Map();
  let workAhead = 0;
  let ahead = 0;
  for (const t of tokens) {
    const aht = ahtFor(t.category_id);
    if (t.status === 'waiting') {
      const ewt = (workAhead / clinicians) * (1 + buffer);
      out.set(t.id, {
        patients_ahead: ahead,
        ewt_exact_minutes: round1(ewt),
        ewt_minutes: Math.round(ewt),
        work_ahead_minutes: round1(workAhead),
        ...band(ewt),
      });
      workAhead += aht;
    } else if (t.status === 'in_consultation' && t.consultation_start) {
      const elapsed = Math.max(0, (now - new Date(t.consultation_start).getTime()) / 60000);
      workAhead += remainingMinutes(aht, elapsed);
    } else {
      workAhead += aht; // called but not started yet
    }
    ahead += 1;
  }
  return out;
};

// ---- Database layer ----

const loadCategoryAHTs = async (db, servicePointId) => {
  const r = await db.query(
    `SELECT vc.id, vc.name, vc.default_minutes::float AS default_minutes, vc.is_default,
       COALESCE((
         SELECT array_agg(s.m ORDER BY s.e)
         FROM (
           SELECT EXTRACT(EPOCH FROM (qt.consultation_end - qt.consultation_start)) / 60 AS m,
                  qt.consultation_end AS e
           FROM queue_tokens qt
           JOIN visits v ON v.id = qt.visit_id
           WHERE v.category_id = vc.id
             AND qt.status = 'completed'
             AND qt.consultation_start IS NOT NULL
             AND qt.consultation_end IS NOT NULL
             AND qt.consultation_end > NOW() - make_interval(days => $2)
             AND qt.consultation_end - qt.consultation_start
                 BETWEEN make_interval(mins => $4) AND make_interval(mins => $5)
           ORDER BY qt.consultation_end DESC
           LIMIT $3
         ) s
       ), '{}') AS recent
     FROM visit_categories vc
     WHERE vc.service_point_id = $1 AND vc.is_active = TRUE`,
    [servicePointId, HISTORY_DAYS, WINDOW, MIN_VALID_MINUTES, MAX_VALID_MINUTES]
  );

  const byId = new Map();
  let fallback = null;
  for (const row of r.rows) {
    const recent = (row.recent || []).map(Number);
    const info = { category_id: row.id, name: row.name, ...categoryAHT(row.default_minutes, recent) };
    byId.set(row.id, info);
    if (row.is_default) fallback = info;
  }
  if (!fallback) fallback = { category_id: null, name: 'Default', aht: 8, source: 'default', sample_size: 0 };
  return { get: (id) => byId.get(id) || fallback, all: [...byId.values()], fallback };
};

// Estimates for every waiting token at a service point (queueDate null = today)
const estimateQueue = async (db, servicePointId, queueDate = null, now = Date.now()) => {
  const sp = await db.query(
    'SELECT active_clinicians, buffer_ratio::float AS buffer_ratio FROM service_points WHERE id = $1',
    [servicePointId]
  );
  const clinicians = sp.rows[0]?.active_clinicians || 1;
  const buffer = sp.rows[0]?.buffer_ratio || 0;
  const ahts = await loadCategoryAHTs(db, servicePointId);

  const t = await db.query(
    `SELECT qt.id, qt.status, qt.consultation_start, v.category_id
     FROM queue_tokens qt
     JOIN visits v ON v.id = qt.visit_id
     WHERE qt.service_point_id = $1
       AND qt.queue_date = COALESCE($2::date, CURRENT_DATE)
       AND qt.status IN ('waiting', 'called', 'in_consultation')
     ORDER BY
       CASE WHEN qt.status = 'waiting' THEN 1 ELSE 0 END,
       CASE WHEN qt.priority = 'urgent' THEN 0 ELSE 1 END,
       qt.sequence_no`,
    [servicePointId, queueDate]
  );

  const estimates = estimateFromQueue({
    tokens: t.rows, ahtFor: (id) => ahts.get(id).aht, clinicians, buffer, now,
  });

  const inConsult = t.rows.find((x) => x.status === 'in_consultation' && x.consultation_start);
  let current = null;
  if (inConsult) {
    const aht = ahts.get(inConsult.category_id).aht;
    const elapsed = Math.max(0, (now - new Date(inConsult.consultation_start).getTime()) / 60000);
    current = { elapsed, remaining: remainingMinutes(aht, elapsed), aht };
  }

  return { estimates, ahts, clinicians, buffer, current };
};

// The estimate for one token (used at registration and check-in)
const computeEWT = async (db, token) => {
  const { estimates, ahts } = await estimateQueue(db, token.service_point_id, token.queue_date);
  const v = await db.query('SELECT category_id FROM visits WHERE id = $1', [token.visit_id]);
  const own = ahts.get(v.rows[0]?.category_id);
  const e = estimates.get(token.id) || {
    patients_ahead: 0, ewt_exact_minutes: 0, ewt_minutes: 0, work_ahead_minutes: 0, ewt_low: 0, ewt_high: 5,
  };
  return {
    ...e,
    avg_service_minutes: round1(own.aht),
    avg_source: own.source === 'ewma' ? 'rolling_average' : 'default',
    sample_size: own.sample_size,
    method: 'category_ewma',
  };
};

module.exports = {
  ALPHA, MIN_COMPLETED, WINDOW, OVERRUN_SHARE,
  ewma, categoryAHT, remainingMinutes, band, estimateFromQueue,
  loadCategoryAHTs, estimateQueue, computeEWT,
};