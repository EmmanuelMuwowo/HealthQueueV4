const pool = require('../db');
const { getAverageServiceMinutes, estimateWait } = require('../services/queueService');

// GET /api/public/queue : no login, no patient names
const getPublicQueue = async (req, res) => {
  try {
    const sps = await pool.query(
      'SELECT id, name, code FROM service_points WHERE is_active = TRUE ORDER BY id'
    );

    const servicePoints = [];
    for (const sp of sps.rows) {
      const tokens = await pool.query(
        `SELECT token_number, priority, status, consultation_start
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

      const active = tokens.rows.filter((t) => t.status !== 'waiting');
      const waitingRaw = tokens.rows.filter((t) => t.status === 'waiting');
      const { avg } = await getAverageServiceMinutes(pool, sp.id);

      servicePoints.push({
        id: sp.id,
        name: sp.name,
        code: sp.code,
        now_serving: active[0]
          ? { token_number: active[0].token_number, status: active[0].status }
          : null,
        waiting_count: waitingRaw.length,
        waiting: waitingRaw.slice(0, 8).map((t, i) => ({
          token_number: t.token_number,
          priority: t.priority,
          ewt_minutes: Math.round(estimateWait({
            ahead: active.length + i,
            avg,
            consultationStart: active.find((x) => x.status === 'in_consultation')?.consultation_start,
          }).ewt),
        })),
      });
    }

    res.json({ updated_at: new Date().toISOString(), service_points: servicePoints });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getPublicQueue };