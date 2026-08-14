-- local-auth-shim.sql
-- NOT part of /supabase/migrations and NEVER applied to a real Supabase
-- project (which already provides these natively). This reproduces
-- Supabase's actual open-source implementation of auth.uid()/auth.jwt() so
-- our RLS policies can be exercised for real against a plain local/CI
-- Postgres instance, using the same mechanism Supabase uses in production:
-- reading the current session's JWT claims via `set_config`.
--
-- Reference implementation this mirrors:
-- https://github.com/supabase/auth-schema (auth.uid / auth.jwt helpers)

create schema if not exists auth;

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'role', 'anon');
$$;
