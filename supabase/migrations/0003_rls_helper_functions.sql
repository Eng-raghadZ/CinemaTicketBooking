-- 0003_rls_helper_functions.sql
-- Helper functions used by RLS policies in 0004.
--
-- These are SECURITY DEFINER and owned by the migration-running role (which
-- in Supabase is a privileged role that bypasses RLS, matching how this file
-- is applied in CI/local testing too — see tests/integration/setup.ts).
-- SECURITY DEFINER is required here specifically to avoid infinite recursion:
-- a policy on `cinema_staff` that queries `cinema_staff` to check membership
-- would otherwise re-trigger RLS on itself. Running the *check* as a definer
-- function bypasses RLS for that one internal lookup while the outer query
-- from the client is still fully subject to RLS. This is the standard,
-- documented pattern for multi-tenant RLS in Postgres/Supabase.

create or replace function current_platform_role()
returns platform_role
language sql
stable
security definer
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid();
$$;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_platform_role() = 'platform_admin', false);
$$;

-- True if the current user has an ACTIVE staff row (any role) for the given cinema.
create or replace function is_active_cinema_staff(target_cinema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cinema_staff
    where cinema_id = target_cinema_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- The current user's staff role for a given cinema, or null if not staff there.
create or replace function cinema_staff_role_for(target_cinema_id uuid)
returns cinema_staff_role
language sql
stable
security definer
set search_path = public
as $$
  select role from cinema_staff
  where cinema_id = target_cinema_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- True if the current user can manage staff for a cinema (owner, or manager
-- explicitly granted the permission via the permissions jsonb).
create or replace function can_manage_cinema_staff(target_cinema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cinema_staff
    where cinema_id = target_cinema_id
      and user_id = auth.uid()
      and status = 'active'
      and (
        role = 'owner'
        or (role = 'manager' and coalesce((permissions->>'manage_staff')::boolean, false))
      )
  );
$$;
