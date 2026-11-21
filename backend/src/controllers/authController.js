const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { passwordProblem } = require('../utils/password');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT * FROM staff WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const staff = result.rows[0];
    const isMatch = await bcrypt.compare(password, staff.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = {
      id: staff.id,
      username: staff.username,
      role: staff.role,
      service_point_id: staff.service_point_id,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res.json({
      token,
      staff: { ...payload, full_name: staff.full_name },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, full_name, role, service_point_id FROM staff WHERE id = $1',
      [req.staff.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/auth/change-password  (any signed-in staff member, for their own account)
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Enter your current password and a new password.' });
    }
    const result = await pool.query(
      'SELECT username, password_hash FROM staff WHERE id = $1 AND is_active = TRUE',
      [req.staff.id]
    );
    const staff = result.rows[0];
    if (!staff || !(await bcrypt.compare(current_password, staff.password_hash))) {
      return res.status(400).json({ error: 'Your current password is not correct.' });
    }
    if (current_password === new_password) {
      return res.status(400).json({ error: 'Choose a password different from the current one.' });
    }
    const problem = passwordProblem(new_password, staff.username);
    if (problem) return res.status(400).json({ error: problem });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE staff SET password_hash = $1 WHERE id = $2', [hash, req.staff.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, getMe, changePassword };