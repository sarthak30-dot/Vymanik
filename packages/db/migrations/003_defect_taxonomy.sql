-- UrjaScan — defect taxonomy (Section 2 of the UrjaScan Portal change spec)
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- Adds a controlled category_code and normalizes defect_type onto the fixed
-- list in packages/types/src/taxonomy.ts. Both are nullable so existing rows
-- (which only have free-text `type`) keep working without a backfill.
-- category_code has no CHECK constraint yet because CO1-CO4 below are
-- placeholders pending Vymanik confirmation (spec open question #1) — add
-- the CHECK once the real codes are confirmed so the DB, not just the form,
-- enforces the vocabulary.

ALTER TABLE anomalies
  ADD COLUMN IF NOT EXISTS category_code TEXT,
  ADD COLUMN IF NOT EXISTS defect_type TEXT
    CHECK (defect_type IS NULL OR defect_type IN (
      'Diode Failure',
      'Single-cell Hotspot',
      'Multi-cell Hotspot',
      'Full-module Hotspot',
      'Module Offline',
      'Soiling',
      'Delamination',
      'Shading',
      'Cracked Cell',
      'PID (Potential Induced Degradation)',
      'Junction Box Fault',
      'Other'
    ));

CREATE INDEX IF NOT EXISTS anomalies_defect_type_idx ON anomalies(defect_type);
CREATE INDEX IF NOT EXISTS anomalies_category_code_idx ON anomalies(category_code);
