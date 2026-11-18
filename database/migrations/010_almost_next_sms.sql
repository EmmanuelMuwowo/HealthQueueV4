-- 010: "Almost your turn" SMS
-- 1. Allow the new message type in the SMS log
ALTER TABLE sms_log DROP CONSTRAINT IF EXISTS sms_log_kind_check;
ALTER TABLE sms_log ADD CONSTRAINT sms_log_kind_check
  CHECK (kind IN ('registered', 'called', 'reminder_1d', 'reminder_2h', 'almost_next')) NOT VALID;

-- 2. Remember when the message was sent, so each patient gets it at most once
ALTER TABLE queue_tokens ADD COLUMN IF NOT EXISTS almost_next_sent_at TIMESTAMPTZ;
