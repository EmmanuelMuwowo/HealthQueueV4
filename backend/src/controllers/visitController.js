const pool = require('../db');
const { createVisitAndToken, getResultByClientRef } = require('../services/visitService');
const { deliver, registrationMessage } = require('../services/smsService');

const registerVisit = async (req, res) => {
  if (!req.body.full_name || !req.body.service_point_id) {
    return res.status(400).json({ error: 'Full name and service point are required' });
  }

  let result;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    result = await createVisitAndToken(
      client,
      { ...req.body, visit_type: 'walk_in' },
      req.staff.id
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // The same offline registration arrived twice at the same moment
    if (err.code === '23505' && req.body.client_ref) {
      const existing = await getResultByClientRef(pool, req.body.client_ref);
      if (existing) return res.json(existing);
    }
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err.message);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }

  // Already registered earlier: return it, and don't send a second SMS
  if (result.replayed) return res.json(result);

  if (result.patient.phone_number) {
    deliver({
      tokenId: result.token.id,
      kind: 'registered',
      phone: result.patient.phone_number,
      message: registrationMessage({
        token_number: result.token.token_number,
        service_point: result.service_point,
        patients_ahead: result.ewt.patients_ahead,
        ewt_minutes: result.ewt.ewt_minutes,
        ewt_low: result.ewt.ewt_low,
        ewt_high: result.ewt.ewt_high,
      }),
    }).catch(console.error);
  }

  res.status(201).json(result);
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

// GET /api/visits/categories : not sensitive, so no login needed (like service points).
// Only visit types of active service points are listed.
const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT vc.id, vc.service_point_id, vc.code, vc.name, vc.default_minutes::float AS default_minutes, vc.is_default
       FROM visit_categories vc
       JOIN service_points sp ON sp.id = vc.service_point_id
       WHERE vc.is_active = TRUE AND sp.is_active = TRUE
       ORDER BY vc.service_point_id, vc.sort_order`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { registerVisit, getServicePoints, getCategories };