-- 009: Settings screen (default consultation times, clinicians, buffer) and a change log

-- Room for codes generated for visit types added in the browser
ALTER TABLE visit_categories ALTER COLUMN code TYPE VARCHAR(40);

-- Every settings change is recorded: who, what, old value, new value, when.
-- This shows, for example, when assumed default times were replaced by clinic estimates.
CREATE TABLE IF NOT EXISTS settings_log (
  id SERIAL PRIMARY KEY,
  staff_id INTEGER REFERENCES staff(id),
  entity VARCHAR(30) NOT NULL,        -- 'service_point' or 'visit_type'
  entity_id INTEGER NOT NULL,
  entity_name VARCHAR(120),
  field VARCHAR(40) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settings_log_time ON settings_log(changed_at DESC);
