const pool = require('../db');
const { estimateQueue } = require('../services/queueService');
const { deliver, calledMessage, almostNextMessage } = require('../services/smsService');

// Clinicians can only touch their own service point
const canAccess = (staff, spId) =>
  staff.role !== 'clinician' || staff.service_point_id === spId;

const logEvent = (client, token, eventType, eventTime, actorId) =>
  client.query(
    `INSERT INTO event_log (token_id, visit_id, service_point_id, event_type, event_time, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token.id, token.visit_id, token.service_point_id, eventType, eventTime, actorId]
  );

// GET /api/queue/:servicePointId
const getQueue = async (req, res) => {
  try {
    const spId = parseInt(req.params.servicePointId);
    if (!canAccess(req.staff, spId)) {
      return res.status(403).json({ error: 'Not your service point' });
    }

    const sp = await pool.query(
      'SELECT id, name, code FROM service_points WHERE id = $1',
      [spId]
    );
    if (sp.rows.length === 0) {
      return res.status(404).json({ error: 'Service point not found' });
    }

    const result = await pool.query(
      `SELECT qt.*, p.full_name, p.phone_number, vc.name AS category_name
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       JOIN patients p ON p.id = v.patient_id
       LEFT JOIN visit_categories vc ON vc.id = v.category_id
       WHERE qt.service_point_id = $1
         AND qt.queue_date = CURRENT_DATE
         AND qt.status IN ('waiting', 'called', 'in_consultation')
       ORDER BY
         CASE WHEN qt.status = 'waiting' THEN 1 ELSE 0 END,
         CASE WHEN qt.priority = 'urgent' THEN 0 ELSE 1 END,
         qt.sequence_no`,
      [spId]
    );

    const skippedRes = await pool.query(
      `SELECT qt.id, qt.token_number, p.full_name
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       JOIN patients p ON p.id = v.patient_id
       WHERE qt.service_point_id = $1
         AND qt.queue_date = CURRENT_DATE
         AND qt.status = 'skipped'
       ORDER BY qt.sequence_no`,
      [spId]
    );

    const { estimates, ahts, current, cts } = await estimateQueue(pool, spId, null);
    const r1 = (n) => Math.round(n * 10) / 10;

    const active = result.rows.filter((t) => t.status !== 'waiting');
    const waiting = result.rows
      .filter((t) => t.status === 'waiting')
      .map((t) => {
        const e = estimates.get(t.id) || {};
        return {
          ...t,
          patients_ahead: e.patients_ahead ?? 0,
          ewt_minutes: e.ewt_minutes ?? 0,
          ewt_low: e.ewt_low ?? 0,
          ewt_high: e.ewt_high ?? 5,
        };
      });

    res.json({
      service_point: sp.rows[0],
      now_serving: active[0] || null,
      skipped: skippedRes.rows,
      waiting,
      avg_service_minutes: r1(ahts.fallback.aht),
      avg_source: ahts.fallback.source === 'ewma' ? 'rolling_average' : 'default',
      category_aht: ahts.all.map((c) => ({
        name: c.name, aht_minutes: r1(c.aht), source: c.source, sample_size: c.sample_size,
      })),
      call_to_start: { minutes: r1(cts.minutes), source: cts.source, sample_size: cts.sample_size },
      current_elapsed_minutes: current ? r1(current.elapsed) : null,
      current_remaining_minutes: current ? r1(current.remaining) : null,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const notifyCalled = async (token) => {
  const info = await pool.query(
    `SELECT p.phone_number, sp.name AS service_point
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN service_points sp ON sp.id = $2
     WHERE v.id = $1`,
    [token.visit_id, token.service_point_id]
  );
  const row = info.rows[0];
  if (!row || !row.phone_number) return;
  await deliver({
    tokenId: token.id,
    kind: 'called',
    phone: row.phone_number,
    message: calledMessage({
      token_number: token.token_number,
      service_point: row.service_point,
    }),
  });
};
// "Almost your turn" SMS.
// After each call, the patients now in the first ALMOST_NEXT_POSITIONS places (default 2)
// get one message so they can return to the waiting area in time. Patients who registered
// less than ALMOST_NEXT_MIN_AGE_MIN minutes ago (default 5) are skipped: their registration
// SMS already told them the wait is short. Each patient gets this message at most once.
const notifyAlmostNext = async (spId) => {
  const positions = parseInt(process.env.ALMOST_NEXT_POSITIONS || '2');
  const minAge = parseFloat(process.env.ALMOST_NEXT_MIN_AGE_MIN || '5');
  if (!(positions > 0)) return;

  const front = await pool.query(
    `SELECT qt.id, qt.token_number, qt.arrival_time, qt.almost_next_sent_at,
            p.phone_number, sp.name AS service_point
     FROM queue_tokens qt
     JOIN visits v ON v.id = qt.visit_id
     JOIN patients p ON p.id = v.patient_id
     JOIN service_points sp ON sp.id = qt.service_point_id
     WHERE qt.service_point_id = $1 AND qt.queue_date = CURRENT_DATE AND qt.status = 'waiting'
     ORDER BY CASE WHEN qt.priority = 'urgent' THEN 0 ELSE 1 END, qt.sequence_no
     LIMIT $2`,
    [spId, positions]
  );

  for (const t of front.rows) {
    if (!t.phone_number || t.almost_next_sent_at) continue;
    const ageMin = (Date.now() - new Date(t.arrival_time).getTime()) / 60000;
    if (ageMin < minAge) continue;

    // Claim the message first, so two quick calls can never send it twice
    const claim = await pool.query(
      `UPDATE queue_tokens SET almost_next_sent_at = NOW()
       WHERE id = $1 AND almost_next_sent_at IS NULL RETURNING id`,
      [t.id]
    );
    if (claim.rows.length === 0) continue;

    await deliver({
      tokenId: t.id,
      kind: 'almost_next',
      phone: t.phone_number,
      message: almostNextMessage({ token_number: t.token_number, service_point: t.service_point }),
    });
  }
};

// POST /api/queue/:servicePointId/call-next
const callNext = async (req, res) => {
  const spId = parseInt(req.params.servicePointId);
  if (!canAccess(req.staff, spId)) {
    return res.status(403).json({ error: 'Not your service point' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialise call-next per service point so two clicks can never call two patients
    await client.query('SELECT pg_advisory_xact_lock($1)', [spId]);

    const active = await client.query(
      `SELECT token_number, status FROM queue_tokens
       WHERE service_point_id = $1 AND queue_date = CURRENT_DATE
         AND status IN ('called', 'in_consultation')`,
      [spId]
    );
    if (active.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `${active.rows[0].token_number} is still ${active.rows[0].status.replace('_', ' ')}. Complete them first.`,
      });
    }

    // Urgent first, then first-come-first-served
    const next = await client.query(
      `SELECT id FROM queue_tokens
       WHERE service_point_id = $1 AND queue_date = CURRENT_DATE AND status = 'waiting'
       ORDER BY CASE WHEN priority = 'urgent' THEN 0 ELSE 1 END, sequence_no
       LIMIT 1`,
      [spId]
    );
    if (next.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No patients waiting' });
    }

    const updated = await client.query(
      `UPDATE queue_tokens SET status = 'called', called_time = NOW(), called_by = $2
       WHERE id = $1 RETURNING *`,
      [next.rows[0].id, req.staff.id]
    );
    const token = updated.rows[0];
    await logEvent(client, token, 'called', token.called_time, req.staff.id);

    await client.query('COMMIT');
    notifyCalled(token).catch(console.error);
    notifyAlmostNext(spId).catch(console.error);
    res.json(token);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// Shared handler for Start and Complete
const transition = ({ from, to, timeColumn, eventType }) => async (req, res) => {
  const tokenId = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT * FROM queue_tokens WHERE id = $1 FOR UPDATE',
      [tokenId]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Token not found' });
    }
    const current = found.rows[0];
    if (!canAccess(req.staff, current.service_point_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your service point' });
    }
    if (current.status !== from) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Token ${current.token_number} is "${current.status}", expected "${from}"`,
      });
    }

    // timeColumn is a fixed internal constant, never user input
    const updated = await client.query(
      `UPDATE queue_tokens SET status = $1, ${timeColumn} = NOW() WHERE id = $2 RETURNING *`,
      [to, tokenId]
    );
    const token = updated.rows[0];
    await logEvent(client, token, eventType, token[timeColumn], req.staff.id);

    await client.query('COMMIT');
    res.json(token);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const startConsultation = transition({
  from: 'called',
  to: 'in_consultation',
  timeColumn: 'consultation_start',
  eventType: 'consultation_started',
});

const completeConsultation = transition({
  from: 'in_consultation',
  to: 'completed',
  timeColumn: 'consultation_end',
  eventType: 'completed',
});


// PUT /api/queue/tokens/:id/skip : a called patient did not show up
const skipToken = async (req, res) => {
  const tokenId = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT * FROM queue_tokens WHERE id = $1 FOR UPDATE',
      [tokenId]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Token not found' });
    }
    const current = found.rows[0];
    if (!canAccess(req.staff, current.service_point_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your service point' });
    }
    if (current.status !== 'called') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Only a called patient can be skipped. ${current.token_number} is "${current.status}".`,
      });
    }

    const updated = await client.query(
      `UPDATE queue_tokens SET status = 'skipped' WHERE id = $1 RETURNING *`,
      [tokenId]
    );
    const token = updated.rows[0];
    await logEvent(client, token, 'skipped', new Date(), req.staff.id);

    await client.query('COMMIT');
    res.json(token);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// PUT /api/queue/tokens/:id/requeue : a skipped patient arrives later.
// Same token number, new place at the back. arrival_time is untouched,
// so their total wait is still measured from when they first arrived.
const requeueToken = async (req, res) => {
  const tokenId = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT *, (queue_date = CURRENT_DATE) AS is_today
       FROM queue_tokens WHERE id = $1 FOR UPDATE`,
      [tokenId]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Token not found' });
    }
    const current = found.rows[0];
    if (!canAccess(req.staff, current.service_point_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not your service point' });
    }
    if (current.status !== 'skipped') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Only a skipped patient can be re-queued. ${current.token_number} is "${current.status}".`,
      });
    }
    if (!current.is_today) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Only today\'s skipped tokens can be re-queued.' });
    }

    // The patient may have been registered again since being skipped
    const clash = await client.query(
      `SELECT qt.token_number
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       WHERE v.patient_id = (SELECT patient_id FROM visits WHERE id = $1)
         AND qt.service_point_id = $2
         AND qt.queue_date = CURRENT_DATE
         AND qt.status IN ('waiting', 'called', 'in_consultation')
         AND qt.id <> $3
       LIMIT 1`,
      [current.visit_id, current.service_point_id, current.id]
    );
    if (clash.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `This patient already has an active token (${clash.rows[0].token_number}) in this queue.`,
      });
    }

    // A fresh sequence number puts them at the back of the queue
    const counter = await client.query(
      `INSERT INTO token_counters (service_point_id, queue_date, last_seq)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (service_point_id, queue_date)
       DO UPDATE SET last_seq = token_counters.last_seq + 1
       RETURNING last_seq`,
      [current.service_point_id]
    );

    const updated = await client.query(
      `UPDATE queue_tokens
       SET status = 'waiting', sequence_no = $2, called_time = NULL, called_by = NULL
       WHERE id = $1 RETURNING *`,
      [tokenId, counter.rows[0].last_seq]
    );
    const token = updated.rows[0];
    // 'recalled' is the closest event type already allowed in the schema
    await logEvent(client, token, 'recalled', new Date(), req.staff.id);

    await client.query('COMMIT');
    res.json(token);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = {
  getQueue, callNext, startConsultation, completeConsultation, skipToken, requeueToken,
};