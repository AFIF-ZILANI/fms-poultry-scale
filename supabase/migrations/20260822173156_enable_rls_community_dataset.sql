-- The community dataset tables had no Row Level Security, so with Supabase's
-- default anon/authenticated grants on public-schema tables, the public anon
-- key alone (shipped in every client build) was enough to read and write
-- them directly via PostgREST, bypassing push-community-sale's Clerk-JWT
-- check and HMAC pseudonymization entirely. Confirmed live: an unauthenticated
-- curl against /rest/v1/sale_event returned real rows.
--
-- Only push-community-sale ever needs to touch these tables, and it writes
-- via the service-role key, which bypasses RLS regardless of policies. So
-- enabling RLS with zero policies is sufficient: default-deny for anon and
-- authenticated, no behavior change for the Edge Function.

ALTER TABLE farm_profile  ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_event    ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE upazilas      ENABLE ROW LEVEL SECURITY;
