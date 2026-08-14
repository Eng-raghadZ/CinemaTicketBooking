-- 0005_rls_policies.sql
-- Row Level Security policies. This is the database-layer backstop for
-- multi-tenant isolation required by the approved architecture: even a
-- buggy or compromised application query must not be able to cross tenant
-- boundaries. Default-deny — a table with RLS enabled and no matching
-- policy denies the operation entirely.

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
alter table users enable row level security;

create policy users_select_own on users
  for select using (id = auth.uid() or is_platform_admin());

create policy users_update_own on users
  for update using (id = auth.uid() or is_platform_admin())
  with check (id = auth.uid() or is_platform_admin());

-- Row creation happens via the auth-sync trigger (0006), not direct client
-- inserts — no INSERT policy for `authenticated`/`anon` is intentional.

-- ---------------------------------------------------------------------------
-- USER_ROLES — no self-service writes at all. Role assignment is an
-- explicitly privileged operation (service role / admin tooling only), which
-- is what prevents a customer from ever granting themselves platform_admin.
-- ---------------------------------------------------------------------------
alter table user_roles enable row level security;

create policy user_roles_select_own on user_roles
  for select using (user_id = auth.uid() or is_platform_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated/anon — default deny.

-- ---------------------------------------------------------------------------
-- CINEMAS
-- ---------------------------------------------------------------------------
alter table cinemas enable row level security;

create policy cinemas_select_public_approved on cinemas
  for select using (status = 'approved');

create policy cinemas_select_own_staff on cinemas
  for select using (
    is_active_cinema_staff(id)
    or is_platform_admin()
    -- Also recognize primary_owner_id directly (not just cinema_staff
    -- membership): the 0008 bootstrap trigger that creates the owner's
    -- cinema_staff row is an AFTER INSERT trigger, which runs too late to
    -- satisfy the RETURNING clause's own RLS visibility check on the same
    -- INSERT statement. Checking primary_owner_id here closes that gap
    -- without changing trigger timing (which FK ordering requires).
    or primary_owner_id = auth.uid()
  );

create policy cinemas_insert_self_register on cinemas
  for insert with check (primary_owner_id = auth.uid());
  -- status is force-reset to pending_review by the 0004 trigger regardless
  -- of what the insert payload claims.

create policy cinemas_update_staff_or_admin on cinemas
  for update using (is_active_cinema_staff(id) or is_platform_admin())
  with check (is_active_cinema_staff(id) or is_platform_admin());
  -- Which fields may actually change is further restricted by the 0004
  -- status-change trigger (owners can't self-approve).

-- ---------------------------------------------------------------------------
-- CINEMA_STAFF
-- ---------------------------------------------------------------------------
alter table cinema_staff enable row level security;

create policy cinema_staff_select on cinema_staff
  for select using (
    user_id = auth.uid()
    or can_manage_cinema_staff(cinema_id)
    or is_platform_admin()
  );

create policy cinema_staff_insert on cinema_staff
  for insert with check (
    is_platform_admin()
    or (can_manage_cinema_staff(cinema_id) and invited_by = auth.uid())
  );

create policy cinema_staff_update on cinema_staff
  for update using (
    is_platform_admin()
    or can_manage_cinema_staff(cinema_id)
    or user_id = auth.uid() -- a user may update their own row (e.g. accept an invite)
  )
  with check (
    is_platform_admin()
    or can_manage_cinema_staff(cinema_id)
    or user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- SCREENS & SEATS — public read for approved cinemas (customers browse seat
-- maps), write restricted to owner/manager staff of that cinema or admin.
-- ---------------------------------------------------------------------------
alter table screens enable row level security;

create policy screens_select_public on screens
  for select using (
    exists (select 1 from cinemas c where c.id = cinema_id and c.status = 'approved')
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  );

create policy screens_write_owner_manager on screens
  for all using (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  )
  with check (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  );

alter table seats enable row level security;

create policy seats_select_public on seats
  for select using (
    exists (
      select 1 from screens s
      join cinemas c on c.id = s.cinema_id
      where s.id = screen_id and (c.status = 'approved' or is_active_cinema_staff(c.id))
    )
    or is_platform_admin()
  );

create policy seats_write_owner_manager on seats
  for all using (
    is_platform_admin()
    or exists (
      select 1 from screens s
      where s.id = screen_id and cinema_staff_role_for(s.cinema_id) in ('owner', 'manager')
    )
  )
  with check (
    is_platform_admin()
    or exists (
      select 1 from screens s
      where s.id = screen_id and cinema_staff_role_for(s.cinema_id) in ('owner', 'manager')
    )
  );

-- ---------------------------------------------------------------------------
-- MOVIES — platform-admin write-only catalog (Decision 3). Read is public.
-- ---------------------------------------------------------------------------
alter table movies enable row level security;

create policy movies_select_public on movies
  for select using (true);

create policy movies_write_admin_only on movies
  for all using (is_platform_admin())
  with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- CINEMA_MOVIES — a cinema's selection of catalog titles it shows.
-- ---------------------------------------------------------------------------
alter table cinema_movies enable row level security;

create policy cinema_movies_select on cinema_movies
  for select using (
    exists (select 1 from cinemas c where c.id = cinema_id and c.status = 'approved')
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  );

create policy cinema_movies_write on cinema_movies
  for all using (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  )
  with check (
    is_platform_admin()
    or (cinema_staff_role_for(cinema_id) in ('owner', 'manager') and added_by = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- SHOWTIMES
-- ---------------------------------------------------------------------------
alter table showtimes enable row level security;

create policy showtimes_select on showtimes
  for select using (
    exists (select 1 from cinemas c where c.id = cinema_id and c.status = 'approved')
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  );

create policy showtimes_write on showtimes
  for all using (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  )
  with check (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- SEAT_HOLDS — customers create their own holds; staff/admin can view for
-- operational purposes. Status transitions (held -> booked/released) are
-- performed exclusively by trusted server code running as service_role,
-- which bypasses RLS by design — no UPDATE policy exists for other roles.
-- ---------------------------------------------------------------------------
alter table seat_holds enable row level security;

create policy seat_holds_select on seat_holds
  for select using (
    user_id = auth.uid()
    or is_active_cinema_staff(
      (select showtime.cinema_id from showtimes showtime where showtime.id = showtime_id)
    )
    or is_platform_admin()
  );

create policy seat_holds_insert_own on seat_holds
  for insert with check (user_id = auth.uid());

-- No UPDATE/DELETE policy for authenticated/anon — default deny. Only
-- service_role (sweeper job, payment webhook) transitions hold status.

-- ---------------------------------------------------------------------------
-- BOOKINGS
-- ---------------------------------------------------------------------------
alter table bookings enable row level security;

create policy bookings_select on bookings
  for select using (
    user_id = auth.uid()
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  );

create policy bookings_insert_own on bookings
  for insert with check (user_id = auth.uid() and status = 'pending');

create policy bookings_update on bookings
  for update using (
    user_id = auth.uid()
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  )
  with check (
    user_id = auth.uid()
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  );
  -- Exactly which transitions/fields are allowed is enforced by the 0004
  -- enforce_booking_update_scope trigger — RLS alone only decides row access.

-- ---------------------------------------------------------------------------
-- BOOKING_SEATS
-- ---------------------------------------------------------------------------
alter table booking_seats enable row level security;

create policy booking_seats_select on booking_seats
  for select using (
    exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.user_id = auth.uid() or is_active_cinema_staff(b.cinema_id) or is_platform_admin())
    )
  );

create policy booking_seats_insert_own on booking_seats
  for insert with check (
    exists (
      select 1 from bookings b
      where b.id = booking_id and b.user_id = auth.uid() and b.status = 'pending'
    )
  );

-- ---------------------------------------------------------------------------
-- POLICY ENGINE TABLES
-- ---------------------------------------------------------------------------
alter table platform_policy_limits enable row level security;

create policy platform_policy_limits_select on platform_policy_limits
  for select using (auth.uid() is not null); -- any authenticated user may read the bounds

create policy platform_policy_limits_write on platform_policy_limits
  for all using (is_platform_admin())
  with check (is_platform_admin());

alter table cinema_cancellation_policies enable row level security;

create policy cinema_cancellation_policies_select_public on cinema_cancellation_policies
  for select using (
    exists (select 1 from cinemas c where c.id = cinema_id and c.status = 'approved')
    or is_active_cinema_staff(cinema_id)
    or is_platform_admin()
  );

create policy cinema_cancellation_policies_write on cinema_cancellation_policies
  for all using (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  )
  with check (
    is_platform_admin()
    or cinema_staff_role_for(cinema_id) in ('owner', 'manager')
  );
  -- Bounds validation against platform_policy_limits is enforced by the 0002 trigger.

-- ---------------------------------------------------------------------------
-- PAYMENTS — read-only for customers/staff/admin. Writes are exclusively
-- service_role (Stripe webhook handler), which bypasses RLS — no
-- INSERT/UPDATE policy exists for authenticated/anon by design, matching the
-- "payment status is never client-asserted" requirement.
-- ---------------------------------------------------------------------------
alter table payments enable row level security;

create policy payments_select on payments
  for select using (
    exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.user_id = auth.uid() or is_active_cinema_staff(b.cinema_id) or is_platform_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS — read-only for the owning user; all writes via service_role.
-- ---------------------------------------------------------------------------
alter table notifications enable row level security;

create policy notifications_select_own on notifications
  for select using (user_id = auth.uid() or is_platform_admin());

-- ---------------------------------------------------------------------------
-- AUDIT_LOGS — admin read-only; writes via service_role/admin tooling only.
-- Immutable: intentionally no UPDATE/DELETE policy for any role.
-- ---------------------------------------------------------------------------
alter table audit_logs enable row level security;

create policy audit_logs_select_admin on audit_logs
  for select using (is_platform_admin());
