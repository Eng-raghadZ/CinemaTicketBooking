-- 0004_status_transition_guards.sql
-- RLS controls WHICH rows a role can touch. These triggers additionally
-- restrict WHICH COLUMNS/transitions are allowed, which RLS alone cannot
-- express. Two specific risks from the approved architecture are addressed:
--   1. A cinema owner must not be able to self-approve their own cinema.
--   2. Cinema staff checking in a ticket must not be able to also rewrite
--      the booking's financial fields while they're at it.

-- ---------------------------------------------------------------------------
-- Cinemas: only a platform_admin may change status / reviewed_by / reviewed_at.
-- Owners/staff may still update other fields (name, description, location).
-- ---------------------------------------------------------------------------

create or replace function enforce_cinema_status_change_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for trusted service-role connections (scheduled jobs,
  -- server-side admin tooling using the service key) — the same bypass
  -- pattern already used in enforce_booking_update_scope below, kept
  -- consistent here rather than being admin-JWT-only.
  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'only a platform_admin may change cinema status/review fields';
  end if;
  return new;
end;
$$;

create trigger cinemas_enforce_status_change
  before update on cinemas
  for each row execute function enforce_cinema_status_change_admin_only();

-- New cinemas must always start pending_review, regardless of who inserts them
-- (belt-and-suspenders alongside the RLS WITH CHECK clause in 0005).
create or replace function enforce_cinema_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Same service-role bypass as above — trusted server code (seed scripts,
  -- admin-initiated server actions) may insert a cinema with an explicit
  -- status; an ordinary authenticated non-admin user's self-registration
  -- insert is always forced to pending_review.
  if auth.uid() is null or is_platform_admin() then
    return new;
  end if;
  new.status := 'pending_review';
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end;
$$;

create trigger cinemas_enforce_initial_status
  before insert on cinemas
  for each row execute function enforce_cinema_initial_status();

-- ---------------------------------------------------------------------------
-- Bookings: cinema staff may update a booking ONLY to perform check-in
-- (status confirmed -> checked_in, setting checked_in_at/checked_in_by).
-- Any other field change, or any other status transition, by a non-admin,
-- non-service-role actor is rejected. Payment/refund status changes remain
-- the exclusive responsibility of the (service-role) webhook handler.
-- ---------------------------------------------------------------------------

create or replace function enforce_booking_update_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Full access for platform_admin and the trusted service role (webhooks,
  -- scheduled jobs). auth.uid() is null for service-role connections.
  if is_platform_admin() or auth.uid() is null then
    return new;
  end if;

  -- Anything other than a pending->cancelled self-cancellation by the owning
  -- customer, or a confirmed->checked_in transition by cinema staff, is blocked.
  if new.user_id = auth.uid() then
    if old.status = 'pending' and new.status = 'cancelled'
       and new.total_amount = old.total_amount
       and new.platform_fee_amount = old.platform_fee_amount
       and new.stripe_payment_intent_id is not distinct from old.stripe_payment_intent_id
       and new.checked_in_at is null and new.checked_in_by is null then
      return new;
    end if;
    raise exception 'customers may only cancel their own pending bookings';
  end if;

  if is_active_cinema_staff(old.cinema_id) then
    if old.status = 'confirmed' and new.status = 'checked_in'
       and new.total_amount = old.total_amount
       and new.platform_fee_amount = old.platform_fee_amount
       and new.stripe_payment_intent_id is not distinct from old.stripe_payment_intent_id
       and new.idempotency_key = old.idempotency_key
       and new.user_id = old.user_id
       and new.cinema_id = old.cinema_id
       and new.showtime_id = old.showtime_id then
      return new;
    end if;
    raise exception 'cinema staff may only check in a confirmed booking, no other field changes';
  end if;

  raise exception 'not authorized to update this booking';
end;
$$;

create trigger bookings_enforce_update_scope
  before update on bookings
  for each row execute function enforce_booking_update_scope();
