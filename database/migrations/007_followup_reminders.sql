-- 007: Follow-up appointments and SMS reminders (lecturer feedback point 6)

-- Which visit a follow-up was booked from, and when each reminder was sent
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS follow_up_of_visit INTEGER REFERENCES visits(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_1d_at TIMESTAMPTZ;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_2h_at TIMESTAMPTZ;

-- Reminders belong to an appointment, not to a queue token
ALTER TABLE sms_log ADD COLUMN IF NOT EXISTS appointment_id INTEGER REFERENCES appointments(id);
ALTER TABLE sms_log ALTER COLUMN token_id DROP NOT NULL;

-- Allow the two new message kinds. The original check on sms_log.kind (if any)
-- was created by hand, so remove it by looking it up rather than by name.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'sms_log'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE sms_log DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE sms_log ADD CONSTRAINT sms_log_kind_check
  CHECK (kind IN ('registered', 'called', 'reminder_1d', 'reminder_2h')) NOT VALID;
-- NOT VALID: new rows are checked; existing test rows are left as they are

-- The reminder job looks for booked appointments by time
CREATE INDEX IF NOT EXISTS idx_appointments_status_time ON appointments(status, scheduled_at);
