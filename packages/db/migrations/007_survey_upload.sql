-- UrjaScan — survey upload from Control Center
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- Until now a new inspection deliverable (defect KML + orthomosaic KMZ) was
-- turned into app data by running scripts/import_defect_kml.py and
-- scripts/flatten_superoverlay.py by hand and redeploying. Control Center's
-- "Upload Survey" now does the same work in the browser and stores the
-- result here, so an admin can load a new survey without a developer.

-- ─── Asset-register fields the survey KML carries per defect ───────────────
-- Same fields scripts/import_defect_kml.py wrote into mock-data.ts. All
-- nullable: rows entered by hand or through the CSV wizard don't have them.
ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS block       TEXT,
  ADD COLUMN IF NOT EXISTS smb         TEXT,
  ADD COLUMN IF NOT EXISTS string_side TEXT,
  ADD COLUMN IF NOT EXISTS module      TEXT,
  ADD COLUMN IF NOT EXISTS defect_code TEXT,
  -- Surveyed panel outline, [[lng, lat], ...] closed ring — the map draws it
  -- above z19.5 instead of a dot.
  ADD COLUMN IF NOT EXISTS footprint   JSONB;

CREATE INDEX IF NOT EXISTS anomalies_plant_inspection_idx ON anomalies(plant_id, inspection_id);

-- ─── The built-in plant as a real row ──────────────────────────────────────
-- anomalies.plant_id references plants(id), and plant-001 (the Blocks 06-122
-- plant) has only ever existed in the frontend's mock data — so uploading a
-- survey for it would fail the foreign key. Values match allPlants[0] /
-- `plant` in src/lib/mock-data.ts.
INSERT INTO plants (id, name, location, capacity_mw, total_panels, last_inspection, next_inspection,
                    health_score, daily_loss_inr, daily_loss_kwh, feed_in_tariff, lat, lng)
VALUES ('plant-001', 'Blocks 06-122 Solar Plant', 'Rajasthan, India', 5.7, 10790, '31 March 2026',
        '30 June 2026', 89, 202770, 45059, 4.5, 28.2622, 73.0295)
ON CONFLICT (id) DO NOTHING;

-- ─── Each plant's current survey ───────────────────────────────────────────
-- One row per plant, pointing at the survey the app shows for it. A new
-- upload replaces this row; re-uploading the SAME inspection also replaces
-- that inspection's anomalies, while earlier inspections' anomaly rows are
-- kept as history. The orthomosaic is optional — a defect list alone is a
-- valid survey.
CREATE TABLE IF NOT EXISTS plant_surveys (
  plant_id        TEXT        PRIMARY KEY REFERENCES plants(id) ON DELETE CASCADE,
  inspection_id   TEXT        NOT NULL,
  inspection_date TEXT        NOT NULL,
  defect_count    INTEGER     NOT NULL DEFAULT 0,
  overlay_url     TEXT,
  -- Orthomosaic extent in degrees, read from the KMZ's own <LatLonBox> tags.
  overlay_west    NUMERIC,
  overlay_north   NUMERIC,
  overlay_east    NUMERIC,
  overlay_south   NUMERIC,
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
