const pool = require('../db');
const { httpError, findOrCreatePatient, createVisitAndToken } = require('../services/visitService');
const { deliver, registrationMessage } = require('../services/smsService');

const TZ = 'Africa/Lusaka';

// POST /api/appointments
const bookAppointment = async (req, res) => {
  const {
    full_name, phone_number, date_of_birth, gender,
    service_point_id, scheduled_at, reason,
  } = req.body;

  if (!full_name || !service_point_id || !scheduled_at) {
    return res.status(400).json({ error: 'Name, service point and date/time are required' });
  }
  const when = new Date(scheduled_at);
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ error: 'Invalid date/time' });
  }
  if (when <= new Date()) {
    return res.status(400).json({ error: 'Appointment time must be in the future' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sp = await client.query(
      'SELECT id FROM service_points WHERE id = $1 AND is_active = TRUE',
      [service_point_id]
    );
    if (sp.rows.length === 0) throw httpError(400, 'Invalid service point');

    const patient = await findOrCreatePatient(client, {
      full_name, phone_number, date_of_birth, gender,
    });

    // One booked appointment per patient per service point per day
    const dup = await client.query(
      `SELECT id FROM appointments
       WHERE patient_id = $1 AND service_point_id = $2 AND status = 'booked'
         AND (scheduled_at AT TIME ZONE '${TZ}')::date
           = ($3::timestamptz AT TIME ZONE '${TZ}')::date`,
      [patient.id, service_point_id, when.toISOString()]
    );
    if (dup.rows.length > 0) {
      throw httpError(409, `${patient.full_name} already has a booked appointment on that day.`);
    }

    const created = await client.query(
      `INSERT INTO appointments (patient_id, service_point_id, scheduled_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [patient.id, service_point_id, when.toISOString(), reason || null, req.staff.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ appointment: created.rows[0], patient });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

// GET /api/appointments?date=YYYY-MM-DD&service_point_id=1  (defaults to today)
const listAppointments = async (req, res) => {
  try {
    const date = req.query.date || null;
    const sp = req.query.service_point_id ? parseInt(req.query.service_point_id) : null;

    const result = await pool.query(
      `SELECT a.*, p.full_name, p.phone_number, sp.name AS service_point_name
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN service_points sp ON sp.id = a.service_point_id
       WHERE (a.scheduled_at AT TIME ZONE '${TZ}')::date
           = COALESCE($1::date, (NOW() AT TIME ZONE '${TZ}')::date)
         AND ($2::int IS NULL OR a.service_point_id = $2)
       ORDER BY a.scheduled_at`,
      [date, sp]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /api/appointments/:id/cancel
const cancelAppointment = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'cancelled'
       WHERE id = $1 AND status = 'booked' RETURNING *`,
      [parseInt(req.params.id)]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found, or it is no longer booked' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/appointments/:id/check-in
// Turns a booked appointment into a visit and a queue token (same path as a walk-in)
const checkIn = async (req, res) => {
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const found = await client.query(
      `SELECT *,
         ((scheduled_at AT TIME ZONE '${TZ}')::date = (NOW() AT TIME ZONE '${TZ}')::date) AS is_today
       FROM appointments WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (found.rows.length === 0) throw httpError(404, 'Appointment not found');
    const appt = found.rows[0];

    if (appt.status !== 'booked') {
      throw httpError(409, `This appointment is already ${appt.status.replace('_', ' ')}.`);
    }
    if (!appt.is_today) {
      throw httpError(409, 'Check-in is only possible on the day of the appointment.');
    }

    const result = await createVisitAndToken(
      client,
      {
        patient_id: appt.patient_id,
        service_point_id: appt.service_point_id,
        visit_type: 'appointment',
        reason: appt.reason,
        appointment_id: appt.id,
      },
      req.staff.id
    );

    await client.query(`UPDATE appointments SET status = 'checked_in' WHERE id = $1`, [id]);

    await client.query('COMMIT');
        // SMS goes out after the commit and can never block or break registration
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
        }),
      }).catch(console.error);
    }
    res.status(201).json({ ...result, appointment_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

module.exports = { bookAppointment, listAppointments, cancelAppointment, checkIn };