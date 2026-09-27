-- UrjaScan — team member roles & task assignment
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- The Control Center could add a team member but had no way to record what
-- they actually do (fly the drone vs. process the captured data) or what
-- they're currently assigned to. This adds both as plain columns rather than
-- a separate table — a member has exactly one role and one current task at
-- a time, so a join table would be overhead with no real benefit yet.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Drone Pilot'
    CHECK (role IN ('Drone Pilot', 'Data Processor', 'Pilot & Processor', 'Supervisor')),
  ADD COLUMN IF NOT EXISTS current_task TEXT;
