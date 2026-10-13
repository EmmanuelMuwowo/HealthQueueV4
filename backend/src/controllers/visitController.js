const pool = require('../db');
const { createVisitAndToken } = require('../services/visitService');

const registerVisit = async (req, res) => {
  if (!req.body.full_name || !req.body.service_point_id) {
    return res.status(400).json({ error: 'Full name and service point are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await createVisitAndToken(
      client,
      { ...req.body, visit_type: 'walk_in' },
      req.staff.id
    );
    await client.query('COMMIT');
    res.status(201).json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const getServicePoints = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, code FROM service_points WHERE is_active = TRUE ORDER BY id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { registerVisit, getServicePoints };