-- UrjaScan — initial schema
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query

-- ─── Plants ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plants (
  id               TEXT PRIMARY KEY,
  name             TEXT        NOT NULL,
  location         TEXT        NOT NULL,
  capacity_mw      NUMERIC     NOT NULL,
  total_panels     INTEGER     NOT NULL,
  last_inspection  TEXT,
  next_inspection  TEXT,
  health_score     INTEGER     NOT NULL DEFAULT 100,
  daily_loss_inr   NUMERIC     NOT NULL DEFAULT 0,
  daily_loss_kwh   NUMERIC     NOT NULL DEFAULT 0,
  feed_in_tariff   NUMERIC     NOT NULL DEFAULT 4.5,
  lat              NUMERIC     NOT NULL,
  lng              NUMERIC     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Anomalies ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anomalies (
  id              TEXT PRIMARY KEY,
  inspection_id   TEXT    NOT NULL,
  plant_id        TEXT    NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  panel_id        TEXT    NOT NULL,
  row             INTEGER NOT NULL,
  col             INTEGER NOT NULL,
  type            TEXT    NOT NULL,
  delta_t         NUMERIC,
  severity        TEXT    NOT NULL CHECK (severity IN ('critical','medium','normal','nodata')),
  string          TEXT    NOT NULL,
  inverter        TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'New'
                          CHECK (status IN ('New','Acknowledged','In Repair','Closed')),
  date            TEXT    NOT NULL,
  inspection_time TEXT    NOT NULL,
  rgb_note        TEXT,
  gps_lat         NUMERIC NOT NULL,
  gps_lng         NUMERIC NOT NULL,
  peak_temp       NUMERIC,
  ref_temp        NUMERIC,
  irradiance      NUMERIC,
  module_serial   TEXT,
  daily_loss_inr  NUMERIC,
  daily_loss_kwh  NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anomalies_plant_id_idx       ON anomalies(plant_id);
CREATE INDEX IF NOT EXISTS anomalies_inspection_id_idx  ON anomalies(inspection_id);
CREATE INDEX IF NOT EXISTS anomalies_severity_idx       ON anomalies(severity);
CREATE INDEX IF NOT EXISTS anomalies_status_idx         ON anomalies(status);

-- ─── Inspection history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_history (
  id         BIGSERIAL   PRIMARY KEY,
  plant_id   TEXT        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  date       TEXT        NOT NULL,
  critical   INTEGER     NOT NULL DEFAULT 0,
  medium     INTEGER     NOT NULL DEFAULT 0,
  normal     INTEGER     NOT NULL DEFAULT 0,
  panels     INTEGER     NOT NULL,
  pilot      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inspection_history_plant_id_idx ON inspection_history(plant_id);
