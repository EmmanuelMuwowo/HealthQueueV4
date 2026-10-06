const pool = require('./db');
const bcrypt = require('bcryptjs');

const users = [
  { username: 'reception1', full_name: 'Grace Mulenga', role: 'receptionist', sp: null },
  { username: 'clinician1', full_name: 'Dr. Banda', role: 'clinician', sp: 1 },
  { username: 'manager1', full_name: 'Clinic Manager', role: 'manager', sp: null },
];

(async () => {
  try {
    const hash = await bcrypt.hash('Demo@1234', 10);
    for (const u of users) {
      await pool.query(
        `INSERT INTO staff (username, full_name, password_hash, role, service_point_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING`,
        [u.username, u.full_name, hash, u.role, u.sp]
      );
    }
    console.log('Seeded staff: reception1, clinician1, manager1 (password: Demo@1234)');
  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
})();