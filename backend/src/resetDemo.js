const pool = require('./db');

(async () => {
  try {
    await pool.query(
      `TRUNCATE event_log, queue_tokens, token_counters, visits, patients
       RESTART IDENTITY CASCADE`
    );
    console.log('Demo data cleared. Staff and service points kept.');
  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
})();