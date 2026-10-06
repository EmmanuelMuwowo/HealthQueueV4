-- HealthQueue v4 schema

CREATE TABLE service_points (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  code VARCHAR(5) NOT NULL UNIQUE,
  default_service_minutes INTEGER NOT NULL DEFAULT 8,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE staff (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('receptionist', 'clinician', 'manager', 'admin')),
  service_point_id INTEGER REFERENCES service_points(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE patients (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20),
  date_of_birth DATE,
  gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_patients_phone ON patients(phone_number);

CREATE TABLE visits (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  service_point_id INTEGER NOT NULL REFERENCES service_points(id),
  visit_type VARCHAR(20) NOT NULL DEFAULT 'walk_in'
    CHECK (visit_type IN ('walk_in', 'appointment')),
  reason TEXT,
  registered_by INTEGER REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily token counter per service point (makes token numbers safe and sequential)
CREATE TABLE token_counters (
  service_point_id INTEGER NOT NULL REFERENCES service_points(id),
  queue_date DATE NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service_point_id, queue_date)
);

CREATE TABLE queue_tokens (
  id SERIAL PRIMARY KEY,
  visit_id INTEGER NOT NULL UNIQUE REFERENCES visits(id),
  service_point_id INTEGER NOT NULL REFERENCES service_points(id),
  queue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sequence_no INTEGER NOT NULL,
  token_number VARCHAR(12) NOT NULL,
  priority VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'called', 'in_consultation', 'completed', 'skipped', 'cancelled')),
  arrival_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  called_time TIMESTAMPTZ,
  consultation_start TIMESTAMPTZ,
  consultation_end TIMESTAMPTZ,
  called_by INTEGER REFERENCES staff(id),
  UNIQUE (service_point_id, queue_date, sequence_no)
);
CREATE INDEX idx_tokens_queue ON queue_tokens(service_point_id, queue_date, status);

-- Raw source for all waiting-time analytics
CREATE TABLE event_log (
  id BIGSERIAL PRIMARY KEY,
  token_id INTEGER REFERENCES queue_tokens(id),
  visit_id INTEGER REFERENCES visits(id),
  service_point_id INTEGER REFERENCES service_points(id),
  event_type VARCHAR(30) NOT NULL
    CHECK (event_type IN ('arrived', 'called', 'consultation_started', 'completed', 'skipped', 'cancelled', 'recalled')),
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id INTEGER REFERENCES staff(id),
  metadata JSONB
);
CREATE INDEX idx_events_sp_time ON event_log(service_point_id, event_time);

-- Seed service points
INSERT INTO service_points (name, code) VALUES
  ('General Outpatient', 'GOP'),
  ('Antenatal Care', 'ANC'),
  ('Under-5 Clinic', 'U5C'),
  ('Pharmacy', 'PHA');