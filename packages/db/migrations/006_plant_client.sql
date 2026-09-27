-- UrjaScan — plant client/owner name
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- Control Center's "Add Plant" form has always asked for the client name,
-- but plants had no column for it, so it was dropped on save and every
-- persisted plant came back with no client. Nullable so existing rows keep
-- working without a backfill.

ALTER TABLE plants
  ADD COLUMN IF NOT EXISTS client TEXT;
