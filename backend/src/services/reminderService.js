const pool = require('../db');
const { deliver } = require('./smsService');

const TZ = 'Africa/Lusaka';

const dayLabel = (d) =>
  new Date(d).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ,
  });
const timeLabel = (d) =>
  new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

// No name and nothing clinical: service point, date and time only.
const reminderMessage = (kind, { service_point, scheduled_at }) =>
  kind === 'reminder_1d'
    ? `HealthQueue reminder: your ${service_point} appointment is on ${dayLabel(scheduled_at)} ` +
      `at ${timeLabel(scheduled_at)}. Please check in at reception when you arrive.`
    : `HealthQueue reminder: your ${service_point} appointment is today at ${timeLabel(scheduled_at)}. ` +
      'Please check in at reception when you arrive.';

// Each reminder has a window. It is only sent if the appointment was booked
// before the window opened, so a booking made 3 hours ahead gets the 2-hour
// reminder but not the 1-day one.
const WINDOWS = [
  { kind: 'reminder_1d', column: 'reminder_1d_at', opens: '24 hours', closes: '2 hours' },
  { kind: 'reminder_2h', column: 'reminder_2h_at', opens: '2 hours', closes: '0 hours' },
];

let running = false;

// Finds due reminders, claims them, and sends them. Returns what was processed.
const runReminders = async () => {
  if (running) return [];
  running = true;
  const processed = [];
  try {
    for (const w of WINDOWS) {
      // Claiming (setting the column) and selecting happen in one statement,
      // so a reminder can never be sent twice, even if two runs overlap.
      // w.column, w.opens and w.closes are fixed constants above, never user input.
      const claimed = await pool.query(
        `UPDATE appointments a SET ${w.column} = NOW()
         FROM patients p, service_points sp
         WHERE p.id = a.patient_id AND sp.id = a.service_point_id
           AND a.status = 'booked'
           AND a.${w.column} IS NULL
           AND p.phone_number IS NOT NULL AND p.phone_number <> ''
           AND NOW() >= a.scheduled_at - INTERVAL '${w.opens}'
           AND NOW() <  a.scheduled_at - INTERVAL '${w.closes}'
           AND a.created_at < a.scheduled_at - INTERVAL '${w.opens}'
         RETURNING a.id, a.scheduled_at, p.phone_number, sp.name AS service_point`
      );
      for (const row of claimed.rows) {
        const out = await deliver({
          appointmentId: row.id,
          kind: w.kind,
          phone: row.phone_number,
          message: reminderMessage(w.kind, row),
        });
        processed.push({ appointment_id: row.id, kind: w.kind, status: out.status });
      }
    }
  } finally {
    running = false;
  }
  return processed;
};

// Checks once at start-up and then every minute (REMINDER_INTERVAL_MS to change it).
// Set REMINDERS=off in .env to switch the job off.
const startReminderScheduler = () => {
  if (process.env.REMINDERS === 'off') {
    console.log('Reminder job is off (REMINDERS=off)');
    return;
  }
  const every = parseInt(process.env.REMINDER_INTERVAL_MS) || 60000;
  const tick = () =>
    runReminders()
      .then((done) => {
        if (done.length > 0) console.log(`Reminders processed: ${done.length}`);
      })
      .catch((err) => console.error('Reminder run failed:', err.message));
  tick();
  setInterval(tick, every);
  console.log(`Reminder job running every ${every / 1000} s`);
};

module.exports = { runReminders, reminderMessage, startReminderScheduler };
