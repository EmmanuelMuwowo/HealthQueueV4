CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  service_point_id INTEGER NOT NULL REFERENCES service_points(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked', 'checked_in', 'cancelled', 'no_show')),
  reason TEXT,
  created_by INTEGER REFERENCES staff(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_appointments_sp_time ON appointments(service_point_id, scheduled_at);

ALTER TABLE visits ADD COLUMN appointment_id INTEGER REFERENCES appointments(id);