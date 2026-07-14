-- UrjaScan — team members
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query

CREATE TABLE IF NOT EXISTS team_members (
  id                     TEXT PRIMARY KEY,
  name                   TEXT        NOT NULL,
  email                  TEXT        NOT NULL UNIQUE,
  phone                  TEXT,
  drone_model            TEXT,
  certifications         TEXT[]      NOT NULL DEFAULT '{}',
  assigned_plant_id      TEXT        REFERENCES plants(id) ON DELETE SET NULL,
  status                 TEXT        NOT NULL DEFAULT 'Off Duty'
                                      CHECK (status IN ('On Mission','Active','Off Duty')),
  inspections_completed  INTEGER     NOT NULL DEFAULT 0,
  anomalies_found        INTEGER     NOT NULL DEFAULT 0,
  last_active            TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
