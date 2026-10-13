const { computeEWT } = require('./queueService');

const httpError = (status, message) =>
  Object.assign(new Error(message), { status });

// Same person = same phone AND same name (families often share one phone)
const findOrCreatePatient = async (client, { full_name, phone_number, date_of_birth, gender }) => {
  if (phone_number) {
    const found = await client.query(
      `SELECT * FROM patients
       WHERE phone_number = $1 AND LOWER(TRIM(full_name)) = LOWER(TRIM($2))
       ORDER BY id LIMIT 1`,
      [phone_number, full_name]
    );
    if (found.rows[0]) return found.rows[0];
  }
  const created = await client.query(
    `INSERT INTO patients (full_name, phone_number, date_of_birth, gender)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [full_name, phone_number || null, date_of_birth || null, gender || null]
  );
  return created.rows[0];
};

// Runs inside the caller's transaction (the caller does BEGIN / COMMIT / ROLLBACK)
const createVisitAndToken = async (client, input, staffId) => {
  const {
    patient_id, full_name, phone_number, date_of_birth, gender,
    service_point_id, visit_type, reason, priority, appointment_id,
  } = input;

  const sp = await client.query(
    'SELECT * FROM service_points WHERE id = $1 AND is_active = TRUE',
    [service_point_id]
  );
  if (sp.rows.length === 0) throw httpError(400, 'Invalid service point');

  let patient;
  if (patient_id) {
    const p = await client.query('SELECT * FROM patients WHERE id = $1', [patient_id]);
    patient = p.rows[0];
    if (!patient) throw httpError(400, 'Patient not found');
  } else {
    patient = await findOrCreatePatient(client, { full_name, phone_number, date_of_birth, gender });
  }

  // Guard: one active token per patient per service point
  const duplicate = await client.query(
    `SELECT qt.token_number
     FROM queue_tokens qt
     JOIN visits v ON v.id = qt.visit_id
     WHERE v.patient_id = $1
       AND qt.service_point_id = $2
       AND qt.queue_date = CURRENT_DATE
       AND qt.status IN ('waiting', 'called', 'in_consultation')
     LIMIT 1`,
    [patient.id, service_point_id]
  );
  if (duplicate.rows.length > 0) {
    throw httpError(409,
      `${patient.full_name} already has an active token (${duplicate.rows[0].token_number}) in this queue.`);
  }

  const visit = await client.query(
    `INSERT INTO visits (patient_id, service_point_id, visit_type, reason, registered_by, appointment_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [patient.id, service_point_id, visit_type || 'walk_in', reason || null, staffId, appointment_id || null]
  );

  // Next sequence number (safe under concurrent registrations)
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

  const tokenRes = await client.query(
    `INSERT INTO queue_tokens (visit_id, service_point_id, sequence_no, token_number, priority)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [visit.rows[0].id, service_point_id, seq, tokenNumber, priority === 'urgent' ? 'urgent' : 'normal']
  );
  const token = tokenRes.rows[0];

  // EventLog: raw source for analytics
  await client.query(
    `INSERT INTO event_log (token_id, visit_id, service_point_id, event_type, event_time, actor_id)
     VALUES ($1, $2, $3, 'arrived', $4, $5)`,
    [token.id, visit.rows[0].id, service_point_id, token.arrival_time, staffId]
  );

  const ewt = await computeEWT(client, token);

  return { patient, visit: visit.rows[0], token, service_point: sp.rows[0].name, ewt };
};

module.exports = { httpError, findOrCreatePatient, createVisitAndToken };