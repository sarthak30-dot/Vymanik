-- UrjaScan — enable Row Level Security on service_enquiries
-- Run this in your Supabase project: Dashboard > SQL Editor > New Query
--
-- Migration 008 created service_enquiries without RLS, which left the table
-- readable and writable by anyone holding the public anon key (it holds
-- visitors' names, phones and emails). Every other table already has RLS on.
--
-- No policies are added on purpose: the only code that touches this table is
-- api/plants.ts, which uses the service-role key and bypasses RLS, and the
-- frontend has no Supabase client. With RLS on and no policies, anon and
-- authenticated roles get no access at all.

ALTER TABLE public.service_enquiries ENABLE ROW LEVEL SECURITY;
