-- local-auth-grants.sql
-- Applied AFTER supabase/migrations (specifically after 0007 creates the
-- anon/authenticated/service_role roles). Real Supabase projects already
-- grant EXECUTE on auth.uid()/auth.jwt() to these roles by default — this
-- reproduces that locally so RLS policies work identically in tests.
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Dedicated non-superuser login used only by integration tests. It can assume
-- Supabase API roles via SET ROLE, but cannot bypass RLS.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_test') then
    create role app_test
      login
      password 'app_test_password'
      nosuperuser
      nobypassrls
      noinherit;
  else
    alter role app_test
      with login
      password 'app_test_password'
      nosuperuser
      nobypassrls
      noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to app_test;
