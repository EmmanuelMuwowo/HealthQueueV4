const pool = require('../db');
const { httpError, createVisitAndToken } = require('../services/visitService');
const { deliver, registrationMessage } = require('../services/smsService');
 
// POST /api/referrals  (clinician or admin)
// Body: { token_id, service_point_id, category_id?, priority? }
// After a completed consultation, puts the same patient straight into another
// service point's queue with a new token, without going back to reception.
const referPatient = async (req, res) => {
  const { token_id, service_point_id, category_id, priority } = req.body;
  if (!token_id || !service_point_id) {
    return res.status(400).json({ error: 'Choose the service point to refer to' });
  }
  const targetId = parseInt(service_point_id);
 
  let result;
  let source;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
 
    const found = await client.query(
      `SELECT qt.id, qt.status, qt.service_point_id, qt.token_number, v.patient_id
       FROM queue_tokens qt
       JOIN visits v ON v.id = qt.visit_id
       WHERE qt.id = $1
       FOR UPDATE OF qt`,
      [parseInt(token_id)]
    );
    if (found.rows.length === 0) throw httpError(404, 'Token not found');
    source = found.rows[0];
 
    if (req.staff.role === 'clinician' && req.staff.service_point_id !== source.service_point_id) {
      throw httpError(403, 'Not your service point');
    }
    if (source.status !== 'completed') {
      throw httpError(409, 'Complete the consultation before referring the patient.');
    }
    if (source.service_point_id === targetId) {
      throw httpError(400, 'Choose a different service point.');
    }
 
    // One referral per source token per target service point
    const already = await client.query(
      `SELECT qt.token_number FROM visits v
       JOIN queue_tokens qt ON qt.visit_id = v.id
       WHERE v.referred_from_token = $1 AND v.service_point_id = $2`,
      [source.id, targetId]
    );
    if (already.rows.length > 0) {
      throw httpError(409, `${source.token_number} was already referred there (${already.rows[0].token_number}).`);
    }
 
    result = await createVisitAndToken(
      client,
      {
        patient_id: source.patient_id,
        service_point_id: targetId,
        visit_type: 'referral',
        reason: `Referred from ${source.token_number}`,
        category_id,
        priority,
        referred_from_token: source.id,
      },
      req.staff.id
    );
 
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err.message);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
 
  // Same SMS as registration, sent after the commit; it can never block the referral
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
 
  res.status(201).json({ ...result, referred_from: source.token_number });
};
 
module.exports = { referPatient };