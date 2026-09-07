-- 0016_runtime_privilege_hardening.sql
-- Least-privilege audit of runtime grants on every application table.
--
-- BACKGROUND: a real hosted Supabase project provisions the `anon` and
-- `authenticated` roles itself, before any of this repository's own
-- migrations run, and Supabase's own project bootstrap has historically
-- granted broad default privileges (including TRUNCATE, TRIGGER, and
-- REFERENCES — none of which any Server Action or public-browsing query in
-- this codebase ever needs) on tables in the `public` schema to those
-- roles. 0007_roles_and_grants.sql's own header already notes this
-- ("Supabase projects already provide anon, authenticated, and
-- service_role roles ... This migration only CREATEs them if missing") —
-- it ADDS the specific SELECT/INSERT/UPDATE grants the application needs,
-- but never REVOKES whatever broader privileges the platform may have
-- already granted by default. Confirmed by direct inspection of a real
-- project's runtime grants: `anon`/`authenticated` currently hold
-- TRUNCATE/TRIGGER/REFERENCES on `public` schema tables, none of which are
-- used or intended.
--
-- FIX: revoke everything from anon/authenticated on every table in the
-- public schema (a clean slate, regardless of where the privilege came
-- from), then re-affirm EXACTLY the grants 0007 and 0013 already
-- established. This is deliberately idempotent and safe to run against an
-- already-correctly-configured database (re-granting an already-held
-- privilege is a no-op) as well as one carrying the platform's broader
-- defaults (the revoke removes them). `service_role` is untouched — it is
-- not in the revoke target list, and it bypasses RLS via its BYPASSRLS
-- attribute regardless of table grants, unaffected either way.
--
-- This migration does NOT change WHICH tables anon/authenticated can
-- SELECT/INSERT/UPDATE/DELETE — only the previously-unaudited
-- TRUNCATE/TRIGGER/REFERENCES privileges and any other accidental
-- over-grant are removed. `anon` still cannot reach cinema_staff,
-- audit_logs, users, bookings, payments, notifications, seat_holds,
-- user_roles, platform_policy_limits at all (no SELECT grant, verified by
-- tests/integration/public-browsing-rls.test.ts and the new
-- authorization-hardening integration tests). No sequences exist in this
-- schema requiring a grant audit — every primary key is a UUID default
-- (gen_random_uuid()/uuid_generate_v4()), not a serial/bigserial column, so
-- there is nothing to revoke SELECT/USAGE from on that front.

revoke all on all tables in schema public from anon, authenticated;

-- Re-affirm 0007_roles_and_grants.sql's grants, verbatim.
grant select on cinemas, screens, seats, movies, cinema_movies, showtimes,
  cinema_cancellation_policies to anon;

grant select, insert, update on
  users, user_roles, cinemas, cinema_staff, screens, seats, movies, cinema_movies,
  showtimes, seat_holds, bookings, booking_seats,
  platform_policy_limits, cinema_cancellation_policies
  to authenticated;
grant select on notifications, payments, audit_logs to authenticated;

-- Re-affirm 0013_catalog_permission_enforcement.sql's DELETE grant fix,
-- verbatim.
grant delete on showtimes, cinema_movies, screens to authenticated;
