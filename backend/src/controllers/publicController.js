const pool = require('../db');
const { estimateQueue } = require('../services/queueService');

// GET /api/public/queue : no login, no patient names, no visit types
const getPublicQueue = async (req, res) => {
  try {
    const sps = await pool.query(
      'SELECT id, name, code FROM service_points WHERE is_active = TRUE ORDER BY id'
    );

    const servicePoints = [];
    for (const sp of sps.rows) {
      const tokens = await pool.query(
        `SELECT id, token_number, priority, status
         FROM queue_tokens
         WHERE service_point_id = $1
           AND queue_date = CURRENT_DATE
           AND status IN ('waiting', 'called', 'in_consultation')
         ORDER BY
           CASE WHEN status = 'waiting' THEN 1 ELSE 0 END,
           CASE WHEN priority = 'urgent' THEN 0 ELSE 1 END,
           sequence_no`,
        [sp.id]
      );

      const { estimates } = await estimateQueue(pool, sp.id, null);
      const active = tokens.rows.filter((t) => t.status !== 'waiting');
      const waiting = tokens.rows.filter((t) => t.status === 'waiting');

      servicePoints.push({
        id: sp.id,
        name: sp.name,
        code: sp.code,
        now_serving: active[0]
          ? { token_number: active[0].token_number, status: active[0].status }
          : null,
        waiting_count: waiting.length,
        waiting: waiting.slice(0, 8).map((t) => {
          const e = estimates.get(t.id) || {};
          return {
            token_number: t.token_number,
            priority: t.priority,
            ewt_minutes: e.ewt_minutes ?? 0,
            ewt_low: e.ewt_low ?? 0,
            ewt_high: e.ewt_high ?? 5,
          };
        }),
      });
    }

    res.json({ updated_at: new Date().toISOString(), service_points: servicePoints });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getPublicQueue };