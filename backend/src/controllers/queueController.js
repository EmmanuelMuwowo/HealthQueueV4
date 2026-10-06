const pool = require('../db');
const { getAverageServiceMinutes } = require('../services/queueService');

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
      `SELECT qt.*, p.full_name, p.phone_number
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       JOIN patients p ON p.id = v.patient_id
       WHERE qt.service_point_id = $1
         AND qt.queue_date = CURRENT_DATE
         AND qt.status IN ('waiting', 'called', 'in_consultation')
       ORDER BY
         CASE WHEN qt.status = 'waiting' THEN 1 ELSE 0 END,
         CASE WHEN qt.priority = 'urgent' THEN 0 ELSE 1 END,
         qt.sequence_no`,
      [spId]
    );

    const active = result.rows.filter((t) => t.status !== 'waiting');
    const waitingRaw = result.rows.filter((t) => t.status === 'waiting');
    const { avg, source } = await getAverageServiceMinutes(pool, spId);

    // EWT = patients ahead x average service duration
    const waiting = waitingRaw.map((t, i) => {
      const ahead = active.length + i;
      return { ...t, patients_ahead: ahead, ewt_minutes: Math.round(ahead * avg) };
    });

    res.json({
      service_point: sp.rows[0],
      now_serving: active[0] || null,
      waiting,
      avg_service_minutes: Math.round(avg * 10) / 10,
      avg_source: source,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
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

module.exports = { getQueue, callNext, startConsultation, completeConsultation };