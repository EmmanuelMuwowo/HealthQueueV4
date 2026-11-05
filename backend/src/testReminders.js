// Tests the follow-up reminder job against the real database.
// Run from the backend folder:  node src/testReminders.js
// Creates its own fictional patients and appointments and removes them afterwards.
require('dotenv').config();
process.env.SMS_MODE = 'log'; // never send real SMS from this test

const pool = require('./db');
const { runReminders } = require('./services/reminderService');

let passed = 0;
let failed = 0;
const check = (name, ok) => {
  if (ok) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}`); }
};

(async () => {
  const ids = { patients: [], appointments: [] };
  try {
    const sp = await pool.query(`SELECT id, name FROM service_points WHERE code = 'GOP'`);
    const spId = sp.rows[0].id;

    const mkPatient = async (name, phone) => {
      const r = await pool.query(
        'INSERT INTO patients (full_name, phone_number) VALUES ($1, $2) RETURNING id',
        [name, phone]
      );
      ids.patients.push(r.rows[0].id);
      return r.rows[0].id;
    };
    const mkAppt = async (patientId, inMinutes, bookedMinutesAgo) => {
      const r = await pool.query(
        `INSERT INTO appointments (patient_id, service_point_id, scheduled_at, created_at)
         VALUES ($1, $2, NOW() + make_interval(mins => $3), NOW() - make_interval(mins => $4))
         RETURNING id`,
        [patientId, spId, inMinutes, bookedMinutesAgo]
      );
      ids.appointments.push(r.rows[0].id);
      return r.rows[0].id;
    };

    // A: booked 3 days ago, due in 23 hours        -> 1-day reminder
    // B: booked 3 hours ago, due in 90 minutes      -> 2-hour reminder only
    // C: no phone number                            -> nothing
    // D: booked 10 minutes ago, due in 20 hours     -> nothing yet (booked inside the 1-day window)
    // E: due in 23 hours but cancelled              -> nothing
    const a = await mkAppt(await mkPatient('Reminder Test A', '0977999101'), 23 * 60, 3 * 24 * 60);
    const b = await mkAppt(await mkPatient('Reminder Test B', '0977999102'), 90, 180);
    const c = await mkAppt(await mkPatient('Reminder Test C', null), 23 * 60, 3 * 24 * 60);
    const d = await mkAppt(await mkPatient('Reminder Test D', '0977999104'), 20 * 60, 10);
    const e = await mkAppt(await mkPatient('Reminder Test E', '0977999105'), 23 * 60, 3 * 24 * 60);
    await pool.query(`UPDATE appointments SET status = 'cancelled' WHERE id = $1`, [e]);

    await runReminders();
    // The running server may have claimed some of these first; that is fine,
    // so the checks below look at the database, not at what this call returned.

    const logs = async (apptId) =>
      (await pool.query('SELECT kind, message, status FROM sms_log WHERE appointment_id = $1', [apptId])).rows;

    const la = await logs(a);
    check('A: one 1-day reminder logged', la.length === 1 && la[0].kind === 'reminder_1d');
    check('A: message names the service point and date', la[0] && la[0].message.includes(sp.rows[0].name) && la[0].message.includes(' on '));
    check('A: message contains no patient name', la[0] && !la[0].message.includes('Reminder Test'));

    const lb = await logs(b);
    check('B: one 2-hour reminder, no 1-day reminder', lb.length === 1 && lb[0].kind === 'reminder_2h');
    check('B: message says "today"', lb[0] && lb[0].message.includes('today at'));

    check('C: no phone number, no reminder', (await logs(c)).length === 0);
    check('D: booked inside the 1-day window, no reminder yet', (await logs(d)).length === 0);
    check('E: cancelled appointment, no reminder', (await logs(e)).length === 0);

    const flags = await pool.query(
      'SELECT id, reminder_1d_at IS NOT NULL AS d1, reminder_2h_at IS NOT NULL AS h2 FROM appointments WHERE id = ANY($1)',
      [[a, b]]
    );
    const byId = Object.fromEntries(flags.rows.map((r) => [r.id, r]));
    check('A marked as 1-day reminded', byId[a].d1 && !byId[a].h2);
    check('B marked as 2-hour reminded', byId[b].h2 && !byId[b].d1);

    await runReminders();
    const total = await pool.query(
      'SELECT COUNT(*)::int AS n FROM sms_log WHERE appointment_id = ANY($1)', [ids.appointments]
    );
    check('Running again sends nothing new', total.rows[0].n === 2);
  } catch (err) {
    failed += 1;
    console.log(`  FAIL  unexpected error: ${err.message}`);
  } finally {
    if (ids.appointments.length) {
      await pool.query('DELETE FROM sms_log WHERE appointment_id = ANY($1)', [ids.appointments]);
      await pool.query('DELETE FROM appointments WHERE id = ANY($1)', [ids.appointments]);
    }
    if (ids.patients.length) {
      await pool.query('DELETE FROM patients WHERE id = ANY($1)', [ids.patients]);
    }
    console.log(`\nFollow-up reminders: ${passed} passed, ${failed} failed`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  }
})();