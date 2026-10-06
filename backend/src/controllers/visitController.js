const pool = require('../db');
const { computeEWT } = require('../services/queueService');

const registerVisit = async (req, res) => {
  const {
    full_name, phone_number, date_of_birth, gender,
    service_point_id, visit_type, reason, priority,
  } = req.body;

  if (!full_name || !service_point_id) {
    return res.status(400).json({ error: 'Full name and service point are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Find patient by phone, or create
    let patient;
    if (phone_number) {
      const found = await client.query(
        'SELECT * FROM patients WHERE phone_number = $1 ORDER BY id LIMIT 1',
        [phone_number]
      );
      patient = found.rows[0];
    }
    if (!patient) {
      const created = await client.query(
        `INSERT INTO patients (full_name, phone_number, date_of_birth, gender)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [full_name, phone_number || null, date_of_birth || null, gender || null]
      );
      patient = created.rows[0];
    }

    // 2. Service point
    const sp = await client.query(
      'SELECT * FROM service_points WHERE id = $1 AND is_active = TRUE',
      [service_point_id]
    );
    if (sp.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid service point' });
    }

    // 3. Visit
    const visit = await client.query(
      `INSERT INTO visits (patient_id, service_point_id, visit_type, reason, registered_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [patient.id, service_point_id, visit_type || 'walk_in', reason || null, req.staff.id]
    );

    // 4. Next sequence number (safe under concurrent registrations)
    const counter = await client.query(
      `INSERT INTO token_counters (service_point_id, queue_date, last_seq)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (service_point_id, queue_date)
       DO UPDATE SET last_seq = token_counters.last_seq + 1
       RETURNING last_seq`,
      [service_point_id]
    );
    const seq = counter.rows[0].last_seq;
    const tokenNumber = `${sp.rows[0].code}-${String(seq).padStart(3, '0')}`;

    // 5. Queue token
    const tokenRes = await client.query(
      `INSERT INTO queue_tokens
         (visit_id, service_point_id, sequence_no, token_number, priority)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [visit.rows[0].id, service_point_id, seq, tokenNumber, priority === 'urgent' ? 'urgent' : 'normal']
    );
    const token = tokenRes.rows[0];

    // 6. EventLog: raw source for analytics
    await client.query(
      `INSERT INTO event_log (token_id, visit_id, service_point_id, event_type, event_time, actor_id)
       VALUES ($1, $2, $3, 'arrived', $4, $5)`,
      [token.id, visit.rows[0].id, service_point_id, token.arrival_time, req.staff.id]
    );

    const ewt = await computeEWT(client, token);

    await client.query('COMMIT');
    res.status(201).json({
      patient,
      visit: visit.rows[0],
      token,
      service_point: sp.rows[0].name,
      ewt,
    });
  } catch (err) {
    await client.query('ROLLBACK');
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