const pool = require('../db');
 
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
       ORDER BY l.changed_at DESC LIMIT 15`
    );
    res.json({ service_points: sps.rows, visit_types: cats.rows, recent_changes: log.rows });
  } catch (err) {
    fail(res, err);
  }
};
 
// PUT /api/admin/service-points/:id  { active_clinicians, buffer_ratio }
const updateServicePoint = async (req, res) => {
  const id = parseInt(req.params.id);
  const { active_clinicians, buffer_ratio } = req.body;
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
 
module.exports = { getConfig, updateServicePoint, updateVisitType, createVisitType };
 