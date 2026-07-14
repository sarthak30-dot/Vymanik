-- UrjaScan — asset hierarchy (Section 1 of the UrjaScan Portal change spec)
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- Fixed hierarchy: Plant -> Block -> Inverter -> String -> Module.
-- `modules` exists for future per-module serial-number tracking, but the
-- Admin "Plant Layout" bulk-generate flow (api/plant-layout.ts) does NOT
-- pre-insert one row per module — a plant can have tens of thousands of
-- modules and inserting them all synchronously risks a Vercel function
-- timeout for no real benefit yet. Instead `strings.module_count` holds the
-- count, and the module-level asset ID (…-MOD012) is composed from
-- string + a row/col pair entered on the anomaly/CSV import, not looked up
-- from a pre-existing row. Switch to real module rows once serial-number
-- capture becomes a requirement.

CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  plant_id   TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,        -- e.g. "B24"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plant_id, code)
);

CREATE TABLE IF NOT EXISTS inverters (
  id         TEXT PRIMARY KEY,
  block_id   TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,        -- e.g. "INV03"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (block_id, code)
);

CREATE TABLE IF NOT EXISTS strings (
  id            TEXT PRIMARY KEY,
  inverter_id   TEXT NOT NULL REFERENCES inverters(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,     -- e.g. "STR05"
  module_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inverter_id, code)
);

CREATE TABLE IF NOT EXISTS modules (
  id            TEXT PRIMARY KEY,
  string_id     TEXT NOT NULL REFERENCES strings(id) ON DELETE CASCADE,
  row           INTEGER NOT NULL,
  col           INTEGER NOT NULL,
  serial_number TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (string_id, row, col)
);

CREATE INDEX IF NOT EXISTS blocks_plant_id_idx     ON blocks(plant_id);
CREATE INDEX IF NOT EXISTS inverters_block_id_idx  ON inverters(block_id);
CREATE INDEX IF NOT EXISTS strings_inverter_id_idx ON strings(inverter_id);
CREATE INDEX IF NOT EXISTS modules_string_id_idx   ON modules(string_id);

-- Anomalies gain an optional link to the hierarchy so new records can point
-- at a real string instead of a free-text label. `string`/`inverter` text
-- columns on anomalies stay as-is for backward compatibility with existing
-- rows and the CSV export format.
ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS string_id TEXT REFERENCES strings(id) ON DELETE SET NULL;
