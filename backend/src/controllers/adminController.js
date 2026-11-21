const pool = require('../db');
const bcrypt = require('bcryptjs');
const { passwordProblem } = require('../utils/password');
 
const httpError = (status, message) => Object.assign(new Error(message), { status });
 
const logChange = (client, staffId, entity, id, name, field, oldV, newV) =>
  client.query(
    `INSERT INTO settings_log (staff_id, entity, entity_id, entity_name, field, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [staffId, entity, id, name, field,
     oldV === null || oldV === undefined ? null : String(oldV),
     newV === null || newV === undefined ? null : String(newV)]
  );
 
const fail = (res, err) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err.message);
  return res.status(500).json({ error: 'Server error' });
};
 
// GET /api/admin/config
// Service points, all visit types (including inactive), the measured average of
// recent valid consultations for each type, and the latest settings changes.
const getConfig = async (req, res) => {
  try {
    const sps = await pool.query(
      `SELECT id, name, code, active_clinicians, buffer_ratio::float AS buffer_ratio, is_active
       FROM service_points ORDER BY id`
    );
    const cats = await pool.query(
      `SELECT vc.id, vc.service_point_id, vc.code, vc.name,
              vc.default_minutes::float AS default_minutes, vc.is_default, vc.is_active, vc.sort_order,
              m.recent_count, m.recent_avg
       FROM visit_categories vc
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS recent_count,
                ROUND(AVG(s.mins)::numeric, 1)::float AS recent_avg
         FROM (
           SELECT EXTRACT(EPOCH FROM (qt.consultation_end - qt.consultation_start)) / 60 AS mins
           FROM queue_tokens qt
           JOIN visits v ON v.id = qt.visit_id
           WHERE v.category_id = vc.id
             AND qt.status = 'completed'
             AND qt.consultation_end > NOW() - INTERVAL '30 days'
             AND qt.consultation_end - qt.consultation_start
                 BETWEEN INTERVAL '1 minute' AND INTERVAL '60 minutes'
           ORDER BY qt.consultation_end DESC
           LIMIT 10
         ) s
       ) m ON TRUE
       ORDER BY vc.service_point_id, vc.sort_order NULLS LAST, vc.id`
    );
    const log = await pool.query(
      `SELECT l.changed_at, l.entity, l.entity_name, l.field, l.old_value, l.new_value,
              s.full_name AS changed_by
       FROM settings_log l LEFT JOIN staff s ON s.id = l.staff_id
       ORDER BY l.changed_at DESC LIMIT 40`
    );
    res.json({ service_points: sps.rows, visit_types: cats.rows, recent_changes: log.rows });
  } catch (err) {
    fail(res, err);
  }
};
 
// PUT /api/admin/service-points/:id  { name?, active_clinicians?, buffer_ratio?, is_active? }
// The token prefix (code) cannot be changed: it is part of every token already issued.
const updateServicePoint = async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, active_clinicians, buffer_ratio, is_active } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM service_points WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) throw httpError(404, 'Service point not found');
    const sp = cur.rows[0];
 
    if (active_clinicians !== undefined) {
      const n = Number(active_clinicians);
      if (!Number.isInteger(n) || n < 1 || n > 10) throw httpError(400, 'Clinicians must be a whole number from 1 to 10');
      if (n !== sp.active_clinicians) {
        await client.query('UPDATE service_points SET active_clinicians = $2 WHERE id = $1', [id, n]);
        await logChange(client, req.staff.id, 'service_point', id, sp.name, 'active_clinicians', sp.active_clinicians, n);
      }
    }
    if (name !== undefined) {
      const n = String(name || '').trim();
      if (n.length < 2 || n.length > 60) throw httpError(400, 'Name must be 2 to 60 characters');
      if (n !== sp.name) {
        const clash = await client.query('SELECT 1 FROM service_points WHERE LOWER(name) = LOWER($1) AND id <> $2', [n, id]);
        if (clash.rows[0]) throw httpError(409, 'Another service point already has that name');
        await client.query('UPDATE service_points SET name = $2 WHERE id = $1', [id, n]);
        await logChange(client, req.staff.id, 'service_point', id, sp.name, 'name', sp.name, n);
      }
    }
    if (is_active !== undefined && Boolean(is_active) !== sp.is_active) {
      if (!is_active) {
        const busyQ = await client.query(
          `SELECT COUNT(*)::int AS n FROM queue_tokens
           WHERE service_point_id = $1 AND queue_date = CURRENT_DATE AND status IN ('waiting', 'called', 'in_consultation')`,
          [id]
        );
        if (busyQ.rows[0].n > 0) {
          throw httpError(409, `${sp.name} still has ${busyQ.rows[0].n} patient(s) in today's queue. Finish them first.`);
        }
      }
      await client.query('UPDATE service_points SET is_active = $2 WHERE id = $1', [id, Boolean(is_active)]);
      await logChange(client, req.staff.id, 'service_point', id, sp.name, 'is_active', sp.is_active, Boolean(is_active));
    }
    if (buffer_ratio !== undefined) {
      const b = Number(buffer_ratio);
      if (!Number.isFinite(b) || b < 0 || b > 0.5) throw httpError(400, 'Buffer must be between 0% and 50%');
      if (b !== Number(sp.buffer_ratio)) {
        await client.query('UPDATE service_points SET buffer_ratio = $2 WHERE id = $1', [id, b]);
        await logChange(client, req.staff.id, 'service_point', id, sp.name, 'buffer_ratio', sp.buffer_ratio, b);
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    fail(res, err);
  } finally {
    client.release();
  }
};
 
const checkName = (name) => {
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 60) throw httpError(400, 'Name must be 2 to 60 characters');
  return n;
};
const checkMinutes = (m) => {
  const v = Number(m);
  if (!Number.isFinite(v) || v < 1 || v > 120) throw httpError(400, 'Default time must be 1 to 120 minutes');
  return Math.round(v * 10) / 10;
};
 
// PUT /api/admin/visit-types/:id  { name?, default_minutes?, is_active?, is_default? }
const updateVisitType = async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, default_minutes, is_active, is_default } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM visit_categories WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) throw httpError(404, 'Visit type not found');
    const vt = cur.rows[0];
    const label = vt.name;
 
    if (name !== undefined) {
      const n = checkName(name);
      if (n !== vt.name) {
        await client.query('UPDATE visit_categories SET name = $2 WHERE id = $1', [id, n]);
        await logChange(client, req.staff.id, 'visit_type', id, label, 'name', vt.name, n);
      }
    }
    if (default_minutes !== undefined) {
      const m = checkMinutes(default_minutes);
      if (m !== Number(vt.default_minutes)) {
        await client.query('UPDATE visit_categories SET default_minutes = $2 WHERE id = $1', [id, m]);
        await logChange(client, req.staff.id, 'visit_type', id, label, 'default_minutes', vt.default_minutes, m);
      }
    }
    if (is_default === true && !vt.is_default) {
      if (is_active === false || !vt.is_active) throw httpError(400, 'An inactive visit type cannot be the default');
      // Exactly one default per service point
      await client.query(
        'UPDATE visit_categories SET is_default = FALSE WHERE service_point_id = $1 AND is_default = TRUE',
        [vt.service_point_id]
      );
      await client.query('UPDATE visit_categories SET is_default = TRUE WHERE id = $1', [id]);
      await logChange(client, req.staff.id, 'visit_type', id, label, 'is_default', false, true);
    }
    if (is_active !== undefined && Boolean(is_active) !== vt.is_active) {
      if (!is_active && vt.is_default) {
        throw httpError(400, 'Choose another default for this service point before deactivating this one');
      }
      await client.query('UPDATE visit_categories SET is_active = $2 WHERE id = $1', [id, Boolean(is_active)]);
      await logChange(client, req.staff.id, 'visit_type', id, label, 'is_active', vt.is_active, Boolean(is_active));
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    fail(res, err);
  } finally {
    client.release();
  }
};
 
// POST /api/admin/visit-types  { service_point_id, name, default_minutes }
const createVisitType = async (req, res) => {
  const client = await pool.connect();
  try {
    const spId = parseInt(req.body.service_point_id);
    const name = checkName(req.body.name);
    const minutes = checkMinutes(req.body.default_minutes);
 
    await client.query('BEGIN');
    const sp = await client.query('SELECT id, code, name FROM service_points WHERE id = $1', [spId]);
    if (!sp.rows[0]) throw httpError(400, 'Invalid service point');
 
    const same = await client.query(
      'SELECT id FROM visit_categories WHERE service_point_id = $1 AND LOWER(name) = LOWER($2)',
      [spId, name]
    );
    if (same.rows[0]) throw httpError(409, 'This service point already has a visit type with that name');
 
    // Code like GOP_FAMILYPLAN, made unique with a number if needed
    const base = `${sp.rows[0].code}_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 20) || 'TYPE'}`;
    let code = base;
    for (let i = 2; (await client.query('SELECT 1 FROM visit_categories WHERE code = $1', [code])).rows[0]; i += 1) {
      code = `${base}${i}`;
    }
    const order = await client.query(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM visit_categories WHERE service_point_id = $1', [spId]
    );
    const created = await client.query(
      `INSERT INTO visit_categories (service_point_id, code, name, default_minutes, is_default, is_active, sort_order)
       VALUES ($1, $2, $3, $4, FALSE, TRUE, $5) RETURNING id`,
      [spId, code, name, minutes, order.rows[0].n]
    );
    await logChange(client, req.staff.id, 'visit_type', created.rows[0].id, name, 'created', null,
      `${sp.rows[0].name}, ${minutes} min`);
    await client.query('COMMIT');
    res.status(201).json({ id: created.rows[0].id, code });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err);
  } finally {
    client.release();
  }
};
 
// POST /api/admin/service-points
// { name, code, default_visit_type, default_minutes, active_clinicians?, buffer_ratio? }
// Every service point needs one default visit type, so it is created at the same time.
const createServicePoint = async (req, res) => {
  const client = await pool.connect();
  try {
    const name = checkName(req.body.name);
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(code)) throw httpError(400, 'Token prefix must be 2 to 5 letters, for example LAB');
    const vtName = checkName(req.body.default_visit_type || 'General');
    const minutes = checkMinutes(req.body.default_minutes ?? 10);
    const clinicians = Number(req.body.active_clinicians ?? 1);
    if (!Number.isInteger(clinicians) || clinicians < 1 || clinicians > 10) throw httpError(400, 'Clinicians must be a whole number from 1 to 10');
    const buffer = Number(req.body.buffer_ratio ?? 0);
    if (!Number.isFinite(buffer) || buffer < 0 || buffer > 0.5) throw httpError(400, 'Buffer must be between 0% and 50%');

    await client.query('BEGIN');
    const clash = await client.query(
      'SELECT name, code FROM service_points WHERE LOWER(name) = LOWER($1) OR code = $2', [name, code]
    );
    if (clash.rows[0]) {
      throw httpError(409, clash.rows[0].code === code
        ? `The prefix ${code} is already used by ${clash.rows[0].name}`
        : 'A service point with that name already exists');
    }
    const sp = await client.query(
      `INSERT INTO service_points (name, code, default_service_minutes, active_clinicians, buffer_ratio)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, code, Math.round(minutes), clinicians, buffer]
    );
    const spId = sp.rows[0].id;
    let vtCode = `${code}_${vtName.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 20) || 'TYPE'}`;
    for (let i = 2; (await client.query('SELECT 1 FROM visit_categories WHERE code = $1', [vtCode])).rows[0]; i += 1) {
      vtCode = `${vtCode}${i}`;
    }
    await client.query(
      `INSERT INTO visit_categories (service_point_id, code, name, default_minutes, is_default, is_active, sort_order)
       VALUES ($1, $2, $3, $4, TRUE, TRUE, 1)`,
      [spId, vtCode, vtName, minutes]
    );
    await logChange(client, req.staff.id, 'service_point', spId, name, 'created', null,
      `prefix ${code}, default visit type ${vtName} (${minutes} min)`);
    await client.query('COMMIT');
    res.status(201).json({ id: spId });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err);
  } finally {
    client.release();
  }
};

// ---------------- Staff accounts ----------------
// Managers and administrators manage accounts. Rules that keep the system safe:
// only an administrator can create, change or reset an administrator account;
// nobody can deactivate their own account or change their own role;
// accounts are deactivated, never deleted, because every recorded event names its staff member.

const ROLES = ['receptionist', 'clinician', 'manager', 'admin'];
const ROLE_NAMES = { receptionist: 'Receptionist', clinician: 'Clinician', manager: 'Clinic manager', admin: 'Administrator' };

const canManage = (actor, target) => actor.role === 'admin' || target.role !== 'admin';

const checkServicePoint = async (client, role, spId) => {
  if (role !== 'clinician') return null;
  const id = parseInt(spId);
  if (!id) throw httpError(400, 'Choose the service point this clinician works at');
  const sp = await client.query('SELECT id, name, is_active FROM service_points WHERE id = $1', [id]);
  if (!sp.rows[0] || !sp.rows[0].is_active) throw httpError(400, 'Choose an active service point');
  return id;
};

// GET /api/admin/staff
const listStaff = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.username, s.full_name, s.role, s.service_point_id, sp.name AS service_point,
              s.is_active, s.created_at
       FROM staff s LEFT JOIN service_points sp ON sp.id = s.service_point_id
       ORDER BY s.is_active DESC, s.role, s.full_name`
    );
    res.json(r.rows);
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/admin/staff  { full_name, username, role, service_point_id?, password }
const createStaff = async (req, res) => {
  const client = await pool.connect();
  try {
    const fullName = String(req.body.full_name || '').trim();
    if (fullName.length < 2 || fullName.length > 100) throw httpError(400, 'Enter the full name (2 to 100 characters)');
    const username = String(req.body.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      throw httpError(400, 'Username must be 3 to 30 characters: letters, numbers, dots or underscores');
    }
    const role = req.body.role;
    if (!ROLES.includes(role)) throw httpError(400, 'Choose a role');
    if (role === 'admin' && req.staff.role !== 'admin') throw httpError(403, 'Only an administrator can create an administrator account');
    const problem = passwordProblem(req.body.password, username);
    if (problem) throw httpError(400, problem);

    await client.query('BEGIN');
    const spId = await checkServicePoint(client, role, req.body.service_point_id);
    const taken = await client.query('SELECT 1 FROM staff WHERE LOWER(username) = $1', [username]);
    if (taken.rows[0]) throw httpError(409, 'That username is already taken');
    const hash = await bcrypt.hash(req.body.password, 10);
    const created = await client.query(
      `INSERT INTO staff (username, full_name, password_hash, role, service_point_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, fullName, hash, role, spId]
    );
    await logChange(client, req.staff.id, 'staff', created.rows[0].id, fullName, 'created', null,
      `${ROLE_NAMES[role]}, username ${username}`);
    await client.query('COMMIT');
    res.status(201).json({ id: created.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err);
  } finally {
    client.release();
  }
};

// PUT /api/admin/staff/:id  { full_name?, role?, service_point_id?, is_active? }
const updateStaff = async (req, res) => {
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT * FROM staff WHERE id = $1 FOR UPDATE', [id]);
    const st = cur.rows[0];
    if (!st) throw httpError(404, 'Staff member not found');
    if (!canManage(req.staff, st)) throw httpError(403, 'Only an administrator can change an administrator account');
    const self = id === req.staff.id;
    const { full_name, role, service_point_id, is_active } = req.body;

    if (full_name !== undefined) {
      const n = String(full_name || '').trim();
      if (n.length < 2 || n.length > 100) throw httpError(400, 'Enter the full name (2 to 100 characters)');
      if (n !== st.full_name) {
        await client.query('UPDATE staff SET full_name = $2 WHERE id = $1', [id, n]);
        await logChange(client, req.staff.id, 'staff', id, st.full_name, 'full_name', st.full_name, n);
      }
    }

    const newRole = role !== undefined ? role : st.role;
    if (!ROLES.includes(newRole)) throw httpError(400, 'Choose a role');
    if (newRole !== st.role) {
      if (self) throw httpError(400, 'You cannot change your own role');
      if (newRole === 'admin' && req.staff.role !== 'admin') throw httpError(403, 'Only an administrator can make someone an administrator');
    }
    const newSp = newRole === 'clinician'
      ? await checkServicePoint(client, newRole, service_point_id !== undefined ? service_point_id : st.service_point_id)
      : null;
    if (newRole !== st.role) {
      await client.query('UPDATE staff SET role = $2 WHERE id = $1', [id, newRole]);
      await logChange(client, req.staff.id, 'staff', id, st.full_name, 'role', ROLE_NAMES[st.role], ROLE_NAMES[newRole]);
    }
    if ((newSp || null) !== (st.service_point_id || null)) {
      const names = await client.query('SELECT id, name FROM service_points WHERE id = ANY($1::int[])',
        [[st.service_point_id, newSp].filter(Boolean)]);
      const nameOf = (x) => names.rows.find((r) => r.id === x)?.name || 'none';
      await client.query('UPDATE staff SET service_point_id = $2 WHERE id = $1', [id, newSp]);
      await logChange(client, req.staff.id, 'staff', id, st.full_name, 'service_point', nameOf(st.service_point_id), nameOf(newSp));
    }

    if (is_active !== undefined && Boolean(is_active) !== st.is_active) {
      if (self) throw httpError(400, 'You cannot deactivate your own account');
      await client.query('UPDATE staff SET is_active = $2 WHERE id = $1', [id, Boolean(is_active)]);
      await logChange(client, req.staff.id, 'staff', id, st.full_name, 'is_active', st.is_active, Boolean(is_active));
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err);
  } finally {
    client.release();
  }
};

// POST /api/admin/staff/:id/password  { new_password }
// Sets a new password for someone who has forgotten theirs. The password itself is never logged.
const resetStaffPassword = async (req, res) => {
  const id = parseInt(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query('SELECT id, username, full_name, role FROM staff WHERE id = $1 FOR UPDATE', [id]);
    const st = cur.rows[0];
    if (!st) throw httpError(404, 'Staff member not found');
    if (!canManage(req.staff, st)) throw httpError(403, 'Only an administrator can reset an administrator password');
    const problem = passwordProblem(req.body.new_password, st.username);
    if (problem) throw httpError(400, problem);
    const hash = await bcrypt.hash(req.body.new_password, 10);
    await client.query('UPDATE staff SET password_hash = $2 WHERE id = $1', [id, hash]);
    await logChange(client, req.staff.id, 'staff', id, st.full_name, 'password', null, 'reset');
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, err);
  } finally {
    client.release();
  }
};

module.exports = {
  getConfig, updateServicePoint, createServicePoint, updateVisitType, createVisitType,
  listStaff, createStaff, updateStaff, resetStaffPassword,
};
 