-- UrjaScan — service enquiries from Plant Owner "Coming Soon" services
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- Plant Owners now see "Coming Soon" services (IV Curve Testing, EL Testing,
-- Technical Due Diligence, Transmission Line Inspection, Surveillance &
-- Mapping) on the Services page as an "Enquire Now" option instead of a
-- dead-end badge. Submitting the form here lets Vymanik Aerospace follow up
-- directly by email/WhatsApp — see api/enquiries.ts.

CREATE TABLE IF NOT EXISTS service_enquiries (
  id           TEXT        PRIMARY KEY,
  plant_id     TEXT        NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  service_id   TEXT        NOT NULL,
  service_name TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  phone        TEXT        NOT NULL,
  email        TEXT,
  message      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_enquiries_plant_idx ON service_enquiries(plant_id);
