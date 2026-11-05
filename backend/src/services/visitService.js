const { computeEWT } = require('./queueService');
const { normalizePhone } = require('../utils/phone');
 
const httpError = (status, message) =>
  Object.assign(new Error(message), { status });
 
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OFFLINE_AGE_MS = 12 * 60 * 60 * 1000;
const lusakaDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lusaka' });
 
// A registration captured offline keeps its real arrival time, within limits.
const resolveArrival = (captured_at) => {
  if (!captured_at) return null;
  const t = new Date(captured_at);
  if (Number.isNaN(t.getTime())) return null;
  const age = Date.now() - t.getTime();
  if (age < -60000 || age > MAX_OFFLINE_AGE_MS) return null;
  if (lusakaDate(t) !== lusakaDate(new Date())) return null;
  return t.toISOString();
};
 
// The visit category must belong to the chosen service point.
// No category given: use that service point's default.
const resolveCategory = async (client, servicePointId, categoryId) => {
  if (categoryId) {
    const r = await client.query(
      `SELECT * FROM visit_categories
       WHERE id = $1 AND service_point_id = $2 AND is_active = TRUE`,
      [categoryId, servicePointId]
    );
    if (!r.rows[0]) throw httpError(400, 'That visit type does not belong to this service point');
    return r.rows[0];
  }
  const d = await client.query(
    `SELECT * FROM visit_categories
     WHERE service_point_id = $1 AND is_default = TRUE AND is_active = TRUE`,
    [servicePointId]
  );
  return d.rows[0] || null;
};
 
const categorySummary = (c) =>
  (c ? { id: c.id, code: c.code, name: c.name, default_minutes: parseFloat(c.default_minutes) } : null);
 
// Same person = same phone AND same name (families often share one phone).
// The phone is optional, but if given it must be a valid Zambian mobile number.
const findOrCreatePatient = async (client, { full_name, phone_number, date_of_birth, gender }) => {
  let phone = null;
  if (phone_number && String(phone_number).trim()) {
    phone = normalizePhone(phone_number);
    if (!phone) {
      throw httpError(400, 'Invalid phone number. Use a Zambian mobile number such as 0977123456.');
    }
  }
 
  if (phone) {
    const found = await client.query(
      `SELECT * FROM patients
       WHERE phone_number = $1 AND LOWER(TRIM(full_name)) = LOWER(TRIM($2))
       ORDER BY id LIMIT 1`,
      [phone, full_name]
    );
    if (found.rows[0]) return found.rows[0];
  }
  const created = await client.query(
    `INSERT INTO patients (full_name, phone_number, date_of_birth, gender)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [full_name, phone, date_of_birth || null, gender || null]
  );
  return created.rows[0];
};
 
// Rebuilds the response for a registration that was already saved
const getResultByClientRef = async (db, clientRef) => {
  const v = await db.query('SELECT * FROM visits WHERE client_ref = $1', [clientRef]);
  const visit = v.rows[0];
  if (!visit) return null;
  const t = await db.query('SELECT * FROM queue_tokens WHERE visit_id = $1', [visit.id]);
  const p = await db.query('SELECT * FROM patients WHERE id = $1', [visit.patient_id]);
  const sp = await db.query('SELECT name FROM service_points WHERE id = $1', [visit.service_point_id]);
  const c = visit.category_id
    ? await db.query('SELECT * FROM visit_categories WHERE id = $1', [visit.category_id])
    : { rows: [] };
  const token = t.rows[0];
  return {
    patient: p.rows[0],
    visit,
    token,
    service_point: sp.rows[0]?.name,
    category: categorySummary(c.rows[0]),
    ewt: await computeEWT(db, token),
    replayed: true,
  };
};
 
// Runs inside the caller's transaction (the caller does BEGIN / COMMIT / ROLLBACK)
const createVisitAndToken = async (client, input, staffId) => {
  const {
    patient_id, full_name, phone_number, date_of_birth, gender,
    service_point_id, visit_type, reason, priority, appointment_id,
    client_ref, captured_at, category_id, referred_from_token,
  } = input;
 
  // Offline sync: the same registration sent twice returns the first result
  if (client_ref) {
    if (!UUID_RE.test(client_ref)) throw httpError(400, 'Invalid client_ref');
    const existing = await getResultByClientRef(client, client_ref);
    if (existing) return existing;
  }
 
  const sp = await client.query(
    'SELECT * FROM service_points WHERE id = $1 AND is_active = TRUE',
    [service_point_id]
  );
  if (sp.rows.length === 0) throw httpError(400, 'Invalid service point');
 
  const category = await resolveCategory(client, service_point_id, category_id);
 
  let patient;
  if (patient_id) {
    const p = await client.query('SELECT * FROM patients WHERE id = $1', [patient_id]);
    patient = p.rows[0];
    if (!patient) throw httpError(400, 'Patient not found');
  } else {
    patient = await findOrCreatePatient(client, { full_name, phone_number, date_of_birth, gender });
  }
 
  // New or returning: counted before this visit is added
  const history = await client.query(
    'SELECT COUNT(*)::int AS n, MAX(created_at) AS last FROM visits WHERE patient_id = $1',
    [patient.id]
  );
  const previousVisits = history.rows[0].n;
 
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
    `INSERT INTO visits
       (patient_id, service_point_id, visit_type, reason, registered_by,
        appointment_id, client_ref, category_id, referred_from_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [patient.id, service_point_id, visit_type || 'walk_in', reason || null, staffId,
     appointment_id || null, client_ref || null, category ? category.id : null,
     referred_from_token || null]
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
    `INSERT INTO queue_tokens
       (visit_id, service_point_id, sequence_no, token_number, priority, arrival_time)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
     RETURNING *`,
    [visit.rows[0].id, service_point_id, seq, tokenNumber,
     priority === 'urgent' ? 'urgent' : 'normal', resolveArrival(captured_at)]
  );
  const token = tokenRes.rows[0];
 
  // EventLog: raw source for analytics
  await client.query(
    `INSERT INTO event_log (token_id, visit_id, service_point_id, event_type, event_time, actor_id, metadata)
     VALUES ($1, $2, $3, 'arrived', $4, $5, $6)`,
    [token.id, visit.rows[0].id, service_point_id, token.arrival_time, staffId,
     client_ref
       ? JSON.stringify({ synced_offline: true })
       : referred_from_token ? JSON.stringify({ referred_from_token }) : null]
  );
 
  const ewt = await computeEWT(client, token);
 
    // Keep the estimate given at registration, for the accuracy evaluation
  await client.query(
    'UPDATE queue_tokens SET ewt_at_registration = $2, ewt_low = $3, ewt_high = $4 WHERE id = $1',
    [token.id, ewt.ewt_exact_minutes, ewt.ewt_low, ewt.ewt_high]
  );
 
  return {
    patient,
    patient_history: {
      status: previousVisits > 0 ? 'returning' : 'new',
      previous_visits: previousVisits,
      last_visit: history.rows[0].last,
    },
    visit: visit.rows[0],
    token,
    service_point: sp.rows[0].name,
    category: categorySummary(category),
    ewt,
  };
};
 
module.exports = {
  httpError, resolveCategory, findOrCreatePatient, getResultByClientRef, createVisitAndToken,
};
