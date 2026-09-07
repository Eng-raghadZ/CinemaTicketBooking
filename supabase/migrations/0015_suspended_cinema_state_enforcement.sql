-- 0015_suspended_cinema_state_enforcement.sql
-- Authorization-hardening pass driven by confirmed manual E2E findings and
-- the now-authoritative cinema-state policy:
--
--   status            | owner/staff internal access | internal mutations         | public visibility
--   pending_review     | allowed                       | allowed                       | hidden
--   rejected            | allowed                       | allowed                       | hidden
--   approved            | allowed                       | allowed                       | visible
--   suspended           | read-only                     | forbidden (non-admin)         | hidden
--
-- Public visibility for `approved` vs everything-else was already correct
-- (cinemas_select_public_approved, and every *_select policy's
-- `exists (... c.status = 'approved')` branch — see
-- 0005_rls_policies.sql). What was MISSING: nothing currently stops an
-- active, otherwise-authorized owner/manager from mutating a SUSPENDED
-- cinema's catalog, staff, or profile. This migration closes that gap at
-- the database layer — RLS/functions/triggers, not just Server Actions —
-- while explicitly preserving read access to a suspended cinema's
-- preserved internal data (owners/staff must still be able to SEE it) and
-- preserving platform_admin's ability to administer suspended cinemas at
-- all times.
--
-- Does not edit 0001-0014. Every function below is `create or replace`
-- against an EXISTING function name where one already exists (matching the
-- precedent already set by 0010→0012 redefining
-- enforce_cinema_staff_update_scope) — the already-created triggers that
-- reference these function names automatically pick up the new bodies via
-- their stable OID binding; no trigger needs to be dropped and recreated
-- for those. Two `drop policy … create policy` pairs are used only where
-- an RLS policy's actual predicate text must change (matching the
-- precedent set by 0013), never touching 0001-0014's own files.

-- =============================================================================
-- 1. NEW HELPER: cinema_is_mutable(cinema_id)
-- =============================================================================
-- A single, narrowly-scoped predicate: true iff the cinema is NOT
-- suspended (pending_review/rejected/approved are all mutable; only
-- suspended is read-only for non-admin callers). Deliberately a STANDALONE
-- helper, not folded into is_active_cinema_staff/can_manage_cinema_staff —
-- per the explicit instruction not to add a suspended-status condition to
-- a helper that is also needed for READ access. This function is never
-- referenced by any *_select policy, only by mutation-authorizing
-- predicates/triggers below.
create or replace function cinema_is_mutable(target_cinema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from cinemas
    where id = target_cinema_id
      and status <> 'suspended'
  );
$$;

-- Referenced directly inside RLS policy text below (cinema_movies_insert/
-- cinema_movies_delete), so the querying role needs direct EXECUTE — but
-- ONLY `authenticated` ever reaches those policies (anon has no
-- INSERT/DELETE grant on cinema_movies at all, see 0007), so `anon` is
-- deliberately NOT granted this. When called from inside another
-- SECURITY DEFINER function/trigger body (can_manage_catalog,
-- enforce_cinema_staff_update_scope, enforce_cinema_profile_update_scope
-- below), the call runs under that function's OWN definer identity, not
-- the original caller's, so no additional grant is required there either
-- way — this grant is solely for the two direct-policy-text usages.
revoke all on function cinema_is_mutable(uuid) from public;
grant execute on function cinema_is_mutable(uuid) to authenticated, service_role;

-- =============================================================================
-- 2. CATALOG MUTATIONS (screens, seats, showtimes): can_manage_catalog
-- =============================================================================
-- can_manage_catalog is used EXCLUSIVELY by mutation-authorizing RLS
-- policies (screens_write_manage_screens, seats_write_manage_screens,
-- showtimes_insert/delete/update_manage_* — see
-- 0013_catalog_permission_enforcement.sql) — never by a *_select policy —
-- so it is safe to extend directly with the suspended check, unlike
-- can_manage_cinema_staff (see section 3). The check is an inline JOIN to
-- `cinemas`, not a call to cinema_is_mutable(), specifically so this
-- change requires NO grant changes at all: can_manage_catalog's own
-- EXECUTE grants (authenticated/service_role from 0013, plus anon from
-- 0014_public_screens_seats_read_fix.sql, needed because it's referenced
-- inside `for all` policies also governing SELECT) are completely
-- unaffected by changing what happens inside its body. The 0014 fix — anon
-- always evaluates this to false via auth.uid() IS NULL — remains intact
-- and is unrelated to this addition.
create or replace function can_manage_catalog(target_cinema_id uuid, permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from cinema_staff cs
    join cinemas c on c.id = cs.cinema_id
    where cs.cinema_id = target_cinema_id
      and cs.user_id = auth.uid()
      and cs.status = 'active'
      and c.status <> 'suspended'
      and (
        cs.role = 'owner'
        or (cs.role = 'manager' and coalesce((cs.permissions ->> permission_key)::boolean, false))
      )
  );
$$;
-- No grant statement needed/changed here — see comment above.

-- =============================================================================
-- 3. CINEMA_MOVIES MUTATIONS: split from `for all` into insert/delete,
--    each requiring cinema_is_mutable(cinema_id)
-- =============================================================================
-- cinema_movies_write (0005_rls_policies.sql, never touched by 0013) is a
-- `for all` policy using cinema_staff_role_for(cinema_id) IN
-- ('owner','manager') with NO suspended check at all — a manager of a
-- suspended cinema could currently add/remove catalog titles freely.
-- Splitting into INSERT/DELETE-only policies (mirroring the exact pattern
-- 0013 already established for showtimes, for the exact same reason:
-- a `for all` policy's USING clause also applies to SELECT, and this
-- table is publicly SELECT-able — see the 0014 postmortem) removes any
-- risk that a future, more-restricted grant on cinema_is_mutable could
-- reintroduce that class of bug, even though today cinema_is_mutable
-- keeps a default PUBLIC-inherited-but-then-restricted grant (still safe
-- either way — see the explicit grant above).
drop policy if exists cinema_movies_write on cinema_movies;

create policy cinema_movies_insert on cinema_movies
  for insert with check (
    is_platform_admin()
    or (
      cinema_staff_role_for(cinema_id) in ('owner', 'manager')
      and cinema_is_mutable(cinema_id)
      and added_by = auth.uid()
    )
  );

create policy cinema_movies_delete on cinema_movies
  for delete using (
    is_platform_admin()
    or (
      cinema_staff_role_for(cinema_id) in ('owner', 'manager')
      and cinema_is_mutable(cinema_id)
    )
  );
-- cinema_movies_select (0005) is UNCHANGED — a suspended cinema's staff
-- can still read its cinema_movies rows via is_active_cinema_staff(cinema_id),
-- which does not consider cinema status at all. Public visibility is
-- unaffected: a suspended cinema was never 'approved', so
-- cinema_movies_select's public branch already excluded it.

-- =============================================================================
-- 4. CINEMA_STAFF VIEW/MANAGE SEPARATION
-- =============================================================================
-- can_manage_cinema_staff is used for BOTH viewing (cinema_staff_select)
-- and mutation authorization (cinema_staff_insert, and inside
-- enforce_cinema_staff_update_scope for the manager-revoke/
-- manager-reinvite branches) — exactly the helper the task says must NOT
-- have a suspended condition added directly, since that would also break
-- viewing the staff roster of a suspended cinema (a documented requirement:
-- "active owners, managers, and staff may retain appropriate read access
-- to their suspended cinema and its preserved internal data").
--
-- can_mutate_cinema_staff is the new, narrowly-scoped MUTATION-ONLY
-- wrapper: can_manage_cinema_staff(...) AND cinema_is_mutable(...).
-- can_view_managed_staff_user (0009_staff_profile_visibility.sql) is left
-- completely untouched — it continues to support permitted read-only
-- staff display regardless of cinema status, and it already has no
-- reachable path for anon (no anon grant on `users`) or for a caller
-- unrelated to that cinema (it recurses through can_manage_cinema_staff,
-- which is itself cinema-scoped) — cross-cinema isolation is unaffected.
create or replace function can_mutate_cinema_staff(target_cinema_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_manage_cinema_staff(target_cinema_id) and cinema_is_mutable(target_cinema_id);
$$;

-- Referenced directly in cinema_staff_insert's WITH CHECK below — only
-- `authenticated` ever reaches that policy (anon has no INSERT grant on
-- cinema_staff at all, see 0007), so anon is deliberately excluded, same
-- reasoning as cinema_is_mutable above.
revoke all on function can_mutate_cinema_staff(uuid) from public;
grant execute on function can_mutate_cinema_staff(uuid) to authenticated, service_role;

-- cinema_staff_insert (invite): replace can_manage_cinema_staff with the
-- mutation-scoped wrapper. This is the EXACT policy text from
-- 0010_cinema_staff_update_guards.sql, with only that one substitution —
-- everything else (role restricted to manager/staff, invited_by = caller,
-- status forced to 'invited') is preserved unchanged.
drop policy if exists cinema_staff_insert on cinema_staff;

create policy cinema_staff_insert on cinema_staff
for insert
with check (
  role in ('manager', 'staff')
  and (
    is_platform_admin()
    or (
      can_mutate_cinema_staff(cinema_id)
      and invited_by = auth.uid()
      and status = 'invited'
    )
  )
);

-- enforce_cinema_staff_update_scope (accept/revoke/reinvite): add
-- cinema_is_mutable to every non-admin mutation-authorizing branch. The
-- owner-membership-is-immutable guard, the "no owner via update" guard,
-- and the admin/service-role bypass are all preserved byte-for-byte from
-- 0012_allow_revoked_staff_reinvite.sql — only the three authorized-branch
-- conditions gain an additional `and cinema_is_mutable(old.cinema_id)`.
-- This is what makes "suspended-cinema invitations cannot be accepted"
-- and "suspended-cinema staff cannot be invited, revoked, or reinvited by
-- non-admin users" both true: accepting an invite, revoking, and
-- reinviting are the three non-admin branches here, and all three now
-- require the cinema to be mutable.
create or replace function enforce_cinema_staff_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' then
    raise exception 'the cinema owner membership cannot be modified';
  end if;

  if new.role = 'owner' then
    raise exception 'a cinema owner membership cannot be created through update';
  end if;

  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;

  -- The invited user may only accept their own invitation, and only while
  -- the cinema is mutable (not suspended).
  if auth.uid() = old.user_id
     and old.status = 'invited'
     and new.status = 'active'
     and cinema_is_mutable(old.cinema_id)
     and new.id is not distinct from old.id
     and new.cinema_id is not distinct from old.cinema_id
     and new.user_id is not distinct from old.user_id
     and new.role is not distinct from old.role
     and new.permissions is not distinct from old.permissions
     and new.invited_by is not distinct from old.invited_by
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  -- An authorized owner/manager may revoke a non-owner membership, only
  -- while the cinema is mutable.
  if can_manage_cinema_staff(old.cinema_id)
     and cinema_is_mutable(old.cinema_id)
     and old.status in ('invited', 'active')
     and new.status = 'revoked'
     and new.id is not distinct from old.id
     and new.cinema_id is not distinct from old.cinema_id
     and new.user_id is not distinct from old.user_id
     and new.role is not distinct from old.role
     and new.permissions is not distinct from old.permissions
     and new.invited_by is not distinct from old.invited_by
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  -- A revoked non-owner may be invited again, only while the cinema is
  -- mutable. Role and permissions can be selected again, but identity and
  -- cinema ownership cannot change.
  if can_manage_cinema_staff(old.cinema_id)
     and cinema_is_mutable(old.cinema_id)
     and old.status = 'revoked'
     and new.status = 'invited'
     and new.role in ('manager', 'staff')
     and new.invited_by = auth.uid()
     and new.id is not distinct from old.id
     and new.cinema_id is not distinct from old.cinema_id
     and new.user_id is not distinct from old.user_id
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  raise exception 'not authorized to update this cinema staff membership';
end;
$$;
-- The trigger `cinema_staff_enforce_update_scope` (created in 0010) already
-- points at this function by name/OID — create or replace above is
-- sufficient, no trigger DDL needed.

-- =============================================================================
-- 5. CINEMAS: sensitive-column protection + owner-only profile editing +
--    suspended-cinema profile is read-only
-- =============================================================================
-- 5a. RLS: narrow row access for UPDATE from "any active staff" to
-- "owner or admin". A plain 'staff' or non-owner 'manager' member has no
-- legitimate reason to touch the cinemas row at all today (no
-- STAFF_PERMISSION_KEYS entry covers cinema-profile editing) — narrowing
-- here means their UPDATE attempt matches zero rows under RLS, rather
-- than reaching the trigger layer at all. Documented decision: only
-- 'owner' may edit cinema profile fields for now; extending to an
-- explicitly-permissioned manager role would require a new
-- STAFF_PERMISSION_KEYS entry first (validation + RLS + docs + tests
-- together), which is out of this narrowly-scoped fix.
drop policy if exists cinemas_update_staff_or_admin on cinemas;

create policy cinemas_update_owner_or_admin on cinemas
  for update using (
    is_platform_admin()
    or cinema_staff_role_for(id) = 'owner'
  )
  with check (
    is_platform_admin()
    or cinema_staff_role_for(id) = 'owner'
  );

-- 5b. Column-level + transition-level guard, extending
-- enforce_cinema_status_change_admin_only (0004_status_transition_guards.sql).
-- Two additions beyond the original status/reviewed_by/reviewed_at
-- protection:
--   - rejection_reason, primary_owner_id, id, created_at are now equally
--     admin-only-mutable (previously unprotected at the column level —
--     an owner passing the old, broader "any active staff" RLS check
--     could have set primary_owner_id or rejection_reason directly).
--   - status transitions are validated against the confirmed four-edge
--     state machine (pending_review→approved, pending_review→rejected,
--     approved→suspended, suspended→approved) REGARDLESS of who is making
--     the change, including platform_admin and the trusted service-role
--     connection: "administer suspended cinemas" means performing the
--     listed legitimate actions, not setting status to an arbitrary value.
--     No existing Server Action or scheduled job ever attempts a status
--     change outside these four edges, so this adds no new restriction to
--     any real workflow — it only rejects transitions nothing legitimate
--     ever performs.
create or replace function enforce_cinema_status_change_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if not (auth.uid() is null or is_platform_admin()) then
      raise exception 'only a platform_admin may change cinema status/review fields';
    end if;

    if not (
      (old.status = 'pending_review' and new.status = 'approved')
      or (old.status = 'pending_review' and new.status = 'rejected')
      or (old.status = 'approved' and new.status = 'suspended')
      or (old.status = 'suspended' and new.status = 'approved')
    ) then
      raise exception 'illegal cinema status transition: % -> %', old.status, new.status;
    end if;
  end if;

  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;

  if new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.rejection_reason is distinct from old.rejection_reason
     or new.primary_owner_id is distinct from old.primary_owner_id
     or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'only a platform_admin may change cinema administrative/ownership fields';
  end if;
  return new;
end;
$$;
-- The trigger `cinemas_enforce_status_change` (created in 0004) already
-- points at this function by name/OID — create or replace above is
-- sufficient, no trigger DDL needed.

-- 5c. NEW trigger: only the active owner may touch the cinemas row at
-- all (defense-in-depth alongside 5a's RLS narrowing — a non-owner who
-- somehow reaches this trigger, e.g. if 5a's policy were ever loosened by
-- a future change, is still independently blocked here), AND the cinema
-- must be mutable (not suspended). Column-level admin-only protection
-- (5b) and this state/role gate are deliberately two separate trigger
-- functions: 5b's rule ("these specific columns are admin-only") holds
-- regardless of cinema state, while 5c's rule ("the owner may edit
-- everything else, but only while not suspended") is the state-dependent
-- one — keeping them separate means neither trigger's logic needs to know
-- about the other's concern.
create or replace function enforce_cinema_profile_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;

  if cinema_staff_role_for(old.id) is distinct from 'owner' then
    raise exception 'only the cinema owner may edit this cinema''s profile';
  end if;

  if not cinema_is_mutable(old.id) then
    raise exception 'a suspended cinema is read-only for non-admin users';
  end if;

  return new;
end;
$$;

create trigger cinemas_enforce_profile_update_scope
  before update on cinemas
  for each row execute function enforce_cinema_profile_update_scope();
