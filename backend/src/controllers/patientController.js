const pool = require('../db');

// GET /api/patients/search?q=0977 or ?q=banda
// Finds existing patients by phone (any format) or by part of their name.
const searchPatients = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json([]);

    const compact = q.replace(/[\s\-+().]/g, '');
    const isPhone = /^\d+$/.test(compact);

    let where;
    let param;
    if (isPhone) {
      // Compare digits only, without the country code or leading 0
      const tail = compact.replace(/^260/, '').replace(/^0/, '');
      where = `regexp_replace(COALESCE(p.phone_number, ''), '[^0-9]', '', 'g') LIKE $1`;
      param = `%${tail}%`;
    } else {
      where = 'p.full_name ILIKE $1';
      param = `%${q.replace(/[%_]/g, '')}%`;
    }

    const result = await pool.query(
      `SELECT p.id, p.full_name, p.phone_number, p.gender,
         COUNT(v.id)::int AS visit_count,
         MAX(v.created_at) AS last_visit
       FROM patients p
       LEFT JOIN visits v ON v.patient_id = p.id
       WHERE ${where}
       GROUP BY p.id
       ORDER BY MAX(v.created_at) DESC NULLS LAST, p.full_name
       LIMIT 10`,
      [param]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { searchPatients };