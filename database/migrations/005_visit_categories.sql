-- Purpose of the visit, within a service point. The default minutes are
-- initial prototype assumptions, replaced by measured averages once enough
-- consultations of that category are completed.
CREATE TABLE visit_categories (
  id SERIAL PRIMARY KEY,
  service_point_id INTEGER NOT NULL REFERENCES service_points(id),
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  default_minutes NUMERIC(5,1) NOT NULL CHECK (default_minutes > 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (service_point_id, code)
);
-- Exactly one default category per service point
CREATE UNIQUE INDEX idx_one_default_category
  ON visit_categories(service_point_id) WHERE is_default;

INSERT INTO visit_categories (service_point_id, code, name, default_minutes, is_default, sort_order)
SELECT sp.id, c.code, c.name, c.mins, c.is_default, c.ord
FROM (VALUES
  ('GOP', 'refill',      'Follow-up / medication refill',     5,  FALSE, 1),
  ('GOP', 'new',         'New complaint',                     10, TRUE,  2),
  ('GOP', 'chronic',     'Chronic or complex review',         15, FALSE, 3),
  ('ANC', 'booking',     'First (booking) visit',             20, FALSE, 1),
  ('ANC', 'followup',    'Routine follow-up',                 10, TRUE,  2),
  ('U5C', 'growth',      'Growth monitoring / immunisation',  5,  TRUE,  1),
  ('U5C', 'sick',        'Sick child',                        12, FALSE, 2),
  ('PHA', 'dispensing',  'Dispensing',                        3,  TRUE,  1)
) AS c(sp_code, code, name, mins, is_default, ord)
JOIN service_points sp ON sp.code = c.sp_code;

ALTER TABLE visits ADD COLUMN category_id INTEGER REFERENCES visit_categories(id);
ALTER TABLE appointments ADD COLUMN category_id INTEGER REFERENCES visit_categories(id);

-- Existing records get their service point's default category
UPDATE visits v SET category_id = vc.id
FROM visit_categories vc
WHERE vc.service_point_id = v.service_point_id AND vc.is_default AND v.category_id IS NULL;

UPDATE appointments a SET category_id = vc.id
FROM visit_categories vc
WHERE vc.service_point_id = a.service_point_id AND vc.is_default AND a.category_id IS NULL;