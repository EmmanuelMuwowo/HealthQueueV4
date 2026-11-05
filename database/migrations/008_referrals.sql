-- 008: Referral from one service point to another (e.g. General Outpatient -> Pharmacy)

-- Which token the patient was referred from
ALTER TABLE visits ADD COLUMN IF NOT EXISTS referred_from_token INTEGER REFERENCES queue_tokens(id);

-- Allow 'referral' as a visit type. Find the existing check by looking it up, not by name.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'visits'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%visit_type%'
  LOOP
    EXECUTE format('ALTER TABLE visits DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE visits ADD CONSTRAINT visits_visit_type_check
  CHECK (visit_type IN ('walk_in', 'appointment', 'referral'));
