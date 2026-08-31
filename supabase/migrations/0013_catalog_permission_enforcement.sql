-- 0013_catalog_permission_enforcement.sql
-- Phase 2 hardening. Screen/seat and showtime writes were previously gated
-- only by the coarse owner/manager role tier
-- (cinema_staff_role_for(cinema_id) IN ('owner','manager')), which meant
-- ANY active manager had full screen/showtime/pricing write access
-- regardless of which specific permission keys (manage_screens,
-- manage_showtimes, manage_pricing — part of Phase 1's
-- STAFF_PERMISSION_KEYS, lib/validation/staff.ts) were actually granted to
-- them. Verified directly against this exact gap before writing this
-- migration: a manager with ONLY `manage_staff: true` could insert a row
-- into `screens` under the pre-existing `screens_write_owner_manager`
-- policy.
--
-- This migration closes that gap at the RLS layer, generalizing the
-- existing can_manage_cinema_staff() pattern (0003_rls_helper_functions.sql,
-- which is specific to the 'manage_staff' key) into a single reusable
-- helper parametrized on the permission key, rather than duplicating the
-- "owner OR manager-with-key" interpretation three separate times.
--
-- Owners are unaffected — they pass every check below unconditionally,
-- exactly as before. Cross-cinema isolation is unaffected — the helper
-- still scopes the cinema_staff lookup to (target_cinema_id, auth.uid()),
-- the same mechanism every existing helper in 0003 uses.
--
-- `cinema_movies` (a cinema's selection of catalog titles) is DELIBERATELY
-- NOT touched at the RLS-policy level here: there is no dedicated
-- permission key for it in STAFF_PERMISSION_KEYS (only manage_staff,
-- manage_showtimes, manage_pricing, manage_screens, view_bookings,
-- manage_bookings, check_in_tickets exist), and the hardening request this
-- migration implements explicitly scoped "At minimum" to screens,
-- showtimes, and pricing. Any active owner/manager retains cinema_movies
-- write access, unchanged — see docs/phase2-catalog-management.md for the
-- reasoning and the follow-up path if that's ever wanted. (Its DELETE
-- grant IS fixed below — that's a distinct, pre-existing bug, not a
-- permission-scoping decision; see the GRANT FIX section.)
--
-- This migration was revised twice after initial review, each time to
-- close a further defense-in-depth gap found by re-reading it against the
-- actual schema rather than just the intended behavior:
--   1. enforce_showtime_update_scope() below was extended to also reject
--      changing `id` itself, not just the more obvious scheduling columns.
--   2. enforce_screen_delete_scope() and
--      enforce_showtime_insert_integrity() (both below) were added: the
--      former closes an ON DELETE CASCADE path from screens to showtimes
--      that let 'manage_screens' indirectly delete showtimes without
--      'manage_showtimes'; the latter closes a gap where
--      showtimes_insert_manage_showtimes authorized an INSERT based only
--      on cinema_id, without the database independently confirming
--      screen_id/movie_id/currency_code were actually consistent with
--      that cinema — see each function's own comment for the full
--      reasoning.

-- ---------------------------------------------------------------------------
-- GRANT FIX (discovered while writing this migration's integration tests,
-- not a pre-existing known issue that was silently worked around): the
-- `authenticated` role was never granted DELETE on `showtimes`,
-- `cinema_movies`, or `screens` at all in 0007_roles_and_grants.sql — only
-- SELECT/INSERT/UPDATE. That's a Postgres GRANT-level block, evaluated
-- BEFORE row-level security is even consulted, so three things could never
-- have worked for ANY caller going through the `authenticated` role
-- (including an owner or a platform_admin using their own session client,
-- which is how every Server Action in this app runs — service_role is
-- reserved for trusted server-only code per lib/db/client.ts):
--   1. `deleteShowtime` (lib/actions/showtimes.ts)
--   2. `removeCinemaMovie` (lib/actions/cinema-movies.ts)
--   3. createScreen's best-effort compensating delete of an orphaned
--      screen row when the seat-batch insert fails (lib/actions/screens.ts)
-- No RLS policy change can fix a GRANT gap; this is the narrowest possible
-- fix, scoped to exactly the three tables this migration's own tests (and
-- the actions they exercise) need DELETE to work on.
-- ---------------------------------------------------------------------------

grant delete on showtimes, cinema_movies, screens to authenticated;

-- ---------------------------------------------------------------------------
-- GENERIC HELPER: owner always true; manager true only if the specific
-- permission key is explicitly granted (permissions->>key = 'true').
-- SECURITY DEFINER + STABLE, matching every existing helper in
-- 0003/0009/0011 — same single-row cinema_staff lookup pattern, kept
-- consistent rather than introduced as a one-off.
-- ---------------------------------------------------------------------------

create or replace function can_manage_catalog(target_cinema_id uuid, permission_key text)
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
        or (role = 'manager' and coalesce((permissions ->> permission_key)::boolean, false))
      )
  );
$$;

revoke all on function can_manage_catalog(uuid, text) from public;
grant execute on function can_manage_catalog(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- SCREENS & SEATS — screen/seat-grid management requires 'manage_screens'.
-- Seat writes are gated identically to screen writes because
-- lib/actions/screens.ts's createScreen generates and inserts both in the
-- same logical operation; there's no separate seat-only permission.
-- ---------------------------------------------------------------------------

drop policy if exists screens_write_owner_manager on screens;

create policy screens_write_manage_screens on screens
  for all using (
    is_platform_admin()
    or can_manage_catalog(cinema_id, 'manage_screens')
  )
  with check (
    is_platform_admin()
    or can_manage_catalog(cinema_id, 'manage_screens')
  );

drop policy if exists seats_write_owner_manager on seats;

create policy seats_write_manage_screens on seats
  for all using (
    is_platform_admin()
    or exists (
      select 1 from screens s
      where s.id = screen_id and can_manage_catalog(s.cinema_id, 'manage_screens')
    )
  )
  with check (
    is_platform_admin()
    or exists (
      select 1 from screens s
      where s.id = screen_id and can_manage_catalog(s.cinema_id, 'manage_screens')
    )
  );

-- ---------------------------------------------------------------------------
-- SHOWTIMES — split the single 'for all' write policy by command, since
-- scheduling (insert/delete) and pricing (update) are governed by
-- different permission keys and neither may imply the other. The
-- application currently only ever performs an UPDATE for a price-only
-- change (lib/actions/showtimes.ts's updateShowtimePrice) — if a future
-- phase reintroduces full showtime editing (time/screen/movie changes),
-- the UPDATE policy below will need revisiting; today it's deliberately
-- scoped to exactly what the application exposes.
-- ---------------------------------------------------------------------------

drop policy if exists showtimes_write on showtimes;

create policy showtimes_insert_manage_showtimes on showtimes
  for insert with check (
    is_platform_admin()
    or can_manage_catalog(cinema_id, 'manage_showtimes')
  );

create policy showtimes_delete_manage_showtimes on showtimes
  for delete using (
    is_platform_admin()
    or can_manage_catalog(cinema_id, 'manage_showtimes')
  );

create policy showtimes_update_manage_pricing on showtimes
  for update using (
    is_platform_admin()
    or can_manage_catalog(cinema_id, 'manage_pricing')
  )
  with check (
    is_platform_admin()
    or can_manage_catalog(cinema_id, 'manage_pricing')
  );

-- ---------------------------------------------------------------------------
-- COLUMN-LEVEL GUARD FOR SHOWTIME UPDATES — RLS above controls WHICH ROWS
-- a 'manage_pricing' manager may UPDATE, but RLS cannot restrict WHICH
-- COLUMNS change within an allowed row. Without this, a manager holding
-- ONLY 'manage_pricing' could pass showtimes_update_manage_pricing's USING/
-- WITH CHECK (both only look at cinema_id) and then issue
-- `UPDATE showtimes SET starts_at = ..., screen_id = ..., movie_id = ...`
-- on their own cinema's showtime — a full reschedule, despite never having
-- been granted 'manage_showtimes'. That would materially widen database
-- authorization beyond what lib/actions/showtimes.ts's updateShowtimePrice
-- actually does (base_price only), breaking the defense-in-depth
-- requirement that RLS not be broader than the application.
--
-- Mirrors the exact mechanism 0004_status_transition_guards.sql already
-- established for this same class of problem
-- (enforce_cinema_status_change_admin_only, enforce_booking_update_scope):
-- a BEFORE UPDATE trigger comparing NEW vs OLD, independent of and
-- additional to RLS. Column privileges (REVOKE UPDATE (col) ...) were
-- considered but rejected: Postgres column privileges can't be made
-- conditional on the 'manage_pricing' jsonb key the way a trigger can, so
-- they'd either block everyone or no one at the SQL-grant level.
--
-- Deliberately applies to EVERY non-admin, non-service-role caller —
-- including an owner — not just managers: Phase 2 does not expose full
-- showtime rescheduling to ANYONE today (see
-- docs/phase2-catalog-management.md, "showtime editing remains
-- price-only"), so no role should be able to achieve it through a raw
-- UPDATE either. platform_admin and service-role connections (auth.uid()
-- is null) bypass entirely, consistent with every existing trigger in
-- 0004.
--
-- The check below covers EVERY column on `showtimes` except `base_price`
-- itself: cinema_id, screen_id, movie_id, starts_at, currency_code,
-- created_at, AND id (the primary key — easy to overlook since it's
-- immutable in ordinary use, but nothing stops a caller from attempting
-- `SET id = ...` and this trigger must reject that too, not just leave it
-- as an accidental gap in an otherwise-enumerated column list).
-- ---------------------------------------------------------------------------

create or replace function enforce_showtime_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_platform_admin() or auth.uid() is null then
    return new;
  end if;

  if new.cinema_id is distinct from old.cinema_id
     or new.screen_id is distinct from old.screen_id
     or new.movie_id is distinct from old.movie_id
     or new.starts_at is distinct from old.starts_at
     or new.currency_code is distinct from old.currency_code
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id then
    raise exception
      'only base_price may be changed on a showtime — rescheduling (starts_at/screen_id/movie_id) is not supported in Phase 2';
  end if;

  return new;
end;
$$;

create trigger showtimes_enforce_update_scope
  before update on showtimes
  for each row execute function enforce_showtime_update_scope();

-- ---------------------------------------------------------------------------
-- SCREEN DELETE GUARD — closes a second review finding: screens_write_
-- manage_screens (above) grants DELETE on screens to anyone with
-- 'manage_screens', and showtimes.screen_id references screens(id) ON
-- DELETE CASCADE (0001_core_schema.sql, unedited). Without this guard, a
-- manager holding ONLY 'manage_screens' — explicitly NOT 'manage_showtimes'
-- — could delete a screen that has real showtimes scheduled on it, and
-- Postgres would cascade-delete every one of those showtimes as ordinary
-- FK housekeeping. That's an indirect showtime deletion with none of the
-- manage_showtimes authorization this migration exists to require —
-- 'manage_screens' would silently imply 'manage_showtimes' through the
-- back door, exactly the kind of implicit-grant this hardening pass is
-- supposed to prevent.
--
-- The fix is a BEFORE DELETE trigger on `screens`, not a schema change to
-- the FK: it fires (and can abort the whole DELETE, including the cascade
-- that hasn't happened yet) before Postgres ever reaches the cascade
-- housekeeping, so no GRANT/RLS change on `showtimes` is needed and
-- 0001_core_schema.sql's cascade definition is untouched. A screen with NO
-- showtimes referencing it (the normal case for a newly created screen,
-- and exactly the case createScreen's compensating delete-on-seat-failure
-- needs — lib/actions/screens.ts) still deletes cleanly; its seats still
-- cascade-delete too, since seats have no comparable cross-permission
-- concern. Applies to owners as well as managers — deliberately
-- unconditional on which permissions the caller holds, not just
-- 'manage_showtimes' vs not: deleting a scheduled showtime by deleting its
-- screen is not an intended path for ANYONE in Phase 2, including someone
-- who holds both 'manage_screens' AND 'manage_showtimes' — the correct
-- sequence is to delete the showtime(s) first (via manage_showtimes),
-- leaving an empty screen, which manage_screens can then remove. Bypassed
-- for platform_admin and trusted service-role connections, matching every
-- other trigger in this migration and in 0004.
-- ---------------------------------------------------------------------------

create or replace function enforce_screen_delete_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_platform_admin() or auth.uid() is null then
    return old;
  end if;

  if exists (select 1 from showtimes where screen_id = old.id) then
    raise exception
      'cannot delete a screen that has showtimes scheduled on it — delete those showtimes first (requires manage_showtimes)';
  end if;

  return old;
end;
$$;

create trigger screens_enforce_delete_scope
  before delete on screens
  for each row execute function enforce_screen_delete_scope();

-- ---------------------------------------------------------------------------
-- SHOWTIME INSERT INTEGRITY — closes the second review finding:
-- showtimes_insert_manage_showtimes (above) authorizes an INSERT based
-- solely on the supplied cinema_id having 'manage_showtimes' granted. But
-- screen_id, movie_id, and currency_code are independent columns with
-- their own FKs (or, for currency_code, no FK at all) — nothing at the
-- database layer previously proved screen_id actually belongs to
-- cinema_id, that (cinema_id, movie_id) is actually a row in
-- cinema_movies, or that currency_code matches the cinema's own
-- currency_code. lib/actions/showtimes.ts's createShowtime already checks
-- all three before inserting, but RLS was not independently proving it —
-- a manager with 'manage_showtimes' on Cinema A could otherwise INSERT a
-- row with cinema_id = Cinema A but screen_id belonging to Cinema B (or
-- any movie_id, or any currency_code) directly against PostgREST,
-- bypassing the Server Action's checks entirely.
--
-- currency_code is included deliberately, not just screen/movie
-- ownership: the architecture's explicit prior decision is that currency
-- is always server-derived from the cinema record and never
-- client-supplied (architecture-plan.md Decision 5) — enforcing that at
-- the database layer, not only in application code, is exactly what this
-- hardening pass is for.
--
-- Scoped to INSERT only, not UPDATE: enforce_showtime_update_scope()
-- above already makes cinema_id/screen_id/movie_id/currency_code
-- immutable after insert for every non-admin caller, so a row that was
-- valid at INSERT time cannot later drift invalid through an UPDATE this
-- schema allows. Also scoped to non-admin/non-service-role callers only,
-- matching every other trigger here — an admin correcting bad data via a
-- privileged UPDATE that changes screen_id/movie_id (which the update-
-- scope trigger already permits for admin) is a pre-existing trusted
-- capability this migration doesn't attempt to further restrict.
-- ---------------------------------------------------------------------------

create or replace function enforce_showtime_insert_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cinema_currency text;
begin
  if is_platform_admin() or auth.uid() is null then
    return new;
  end if;

  if not exists (
    select 1 from screens s where s.id = new.screen_id and s.cinema_id = new.cinema_id
  ) then
    raise exception 'screen does not belong to the specified cinema';
  end if;

  if not exists (
    select 1 from cinema_movies cm where cm.cinema_id = new.cinema_id and cm.movie_id = new.movie_id
  ) then
    raise exception 'movie is not in this cinema''s catalog (cinema_movies)';
  end if;

  select currency_code into v_cinema_currency from cinemas where id = new.cinema_id;

  if v_cinema_currency is null or new.currency_code is distinct from v_cinema_currency then
    raise exception 'currency_code must match the cinema''s configured currency';
  end if;

  return new;
end;
$$;

create trigger showtimes_enforce_insert_integrity
  before insert on showtimes
  for each row execute function enforce_showtime_insert_integrity();
