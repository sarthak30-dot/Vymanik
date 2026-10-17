-- UrjaScan — String Offline / Partial String Offline defect types
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- The Hamirpur audit reports String Offline and Partial String Offline as
-- defect types (each counted as a whole string of modules — see
-- src/lib/affected-modules.ts). packages/types/src/taxonomy.ts now lists them,
-- so the CHECK on anomalies.defect_type (migration 003) has to accept them or
-- the manual-entry / CSV-import paths would be rejected by the database.
-- Survey uploads store the free-text `type` column and are unaffected.

ALTER TABLE anomalies DROP CONSTRAINT IF EXISTS anomalies_defect_type_check;
ALTER TABLE anomalies
  ADD CONSTRAINT anomalies_defect_type_check CHECK (defect_type IS NULL OR defect_type IN (
    'Diode Failure',
    'Single-cell Hotspot',
    'Multi-cell Hotspot',
    'Full-module Hotspot',
    'Module Offline',
    'String Offline',
    'Partial String Offline',
    'Soiling',
    'Delamination',
    'Shading',
    'Cracked Cell',
    'PID (Potential Induced Degradation)',
    'Junction Box Fault',
    'Other'
  ));
