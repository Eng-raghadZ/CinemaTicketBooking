-- 0007_roles_and_grants.sql
-- Supabase projects already provide `anon`, `authenticated`, and
-- `service_role` roles with the correct BYPASSRLS setting on service_role.
-- This migration only CREATEs them if missing (local/CI Postgres), and then
-- grants table privileges identically in both environments — RLS policies
-- (0005) are what actually restrict `anon`/`authenticated`, not these grants.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- anon: only what an unauthenticated visitor may see (public browsing).
grant select on cinemas, screens, seats, movies, cinema_movies, showtimes,
  cinema_cancellation_policies to anon;

-- authenticated: broader, but every table still has RLS enabled (0005), so
-- these grants only define the *ceiling* — RLS narrows it per-row per-user
-- (e.g. `movies` is grantable INSERT/UPDATE/DELETE here, but the
-- movies_write_admin_only RLS policy means only a platform_admin's inserts
-- actually succeed; a non-admin's INSERT is rejected by RLS, not by this
-- grant).
grant select, insert, update on
  users, user_roles, cinemas, cinema_staff, screens, seats, movies, cinema_movies,
  showtimes, seat_holds, bookings, booking_seats,
  platform_policy_limits, cinema_cancellation_policies
  to authenticated;
grant select on notifications, payments, audit_logs to authenticated;

-- service_role: trusted server-side code (webhooks, scheduled jobs). Already
-- bypasses RLS via the BYPASSRLS attribute set above; grant full DML.
grant select, insert, update, delete on all tables in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
