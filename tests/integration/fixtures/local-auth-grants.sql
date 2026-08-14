-- local-auth-grants.sql
-- Applied AFTER supabase/migrations (specifically after 0007 creates the
-- anon/authenticated/service_role roles). Real Supabase projects already
-- grant EXECUTE on auth.uid()/auth.jwt() to these roles by default — this
-- reproduces that locally so RLS policies work identically in tests.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- The non-superuser `app` role (used by tests/integration/db-helper.ts to
-- genuinely exercise RLS, as opposed to the postgres superuser used for
-- fixture setup) must be able to assume these roles via SET ROLE.
grant anon, authenticated, service_role to app;
