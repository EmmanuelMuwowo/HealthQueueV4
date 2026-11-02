-- Settings for the EWT formula, per service point.
-- The prototype keeps active_clinicians = 1 and buffer_ratio = 0:
-- Call next allows one active patient per service point, and no data
-- exists yet to estimate an emergency buffer.
ALTER TABLE service_points
  ADD COLUMN active_clinicians INTEGER NOT NULL DEFAULT 1 CHECK (active_clinicians >= 1),
  ADD COLUMN buffer_ratio NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (buffer_ratio >= 0 AND buffer_ratio <= 1);

-- The estimate given at registration, kept for the accuracy evaluation
ALTER TABLE queue_tokens
  ADD COLUMN ewt_at_registration NUMERIC(6,1),
  ADD COLUMN ewt_low INTEGER,
  ADD COLUMN ewt_high INTEGER;