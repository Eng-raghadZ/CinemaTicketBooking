-- 0002_constraints.sql
-- Concurrency-critical constraints and cross-table validation that must live
-- in the database, not just application code, per the approved architecture
-- ("do not skip database constraints").

-- ---------------------------------------------------------------------------
-- DOUBLE-BOOKING PREVENTION
-- A seat can have at most one active hold/booking per showtime. This is the
-- authoritative guard: even if application code has a bug or two requests
-- race, Postgres itself rejects the second row.
-- ---------------------------------------------------------------------------

create unique index seat_holds_active_unique_idx
  on seat_holds (showtime_id, seat_id)
  where status in ('held', 'booked');

-- Deferred FK from seat_holds -> bookings (bookings table didn't exist yet in 0001).
alter table seat_holds
  add constraint seat_holds_booking_id_fkey
  foreign key (booking_id) references bookings(id) on delete set null;

create index seat_holds_booking_id_idx on seat_holds (booking_id);

-- ---------------------------------------------------------------------------
-- IDEMPOTENT CHECK-IN
-- Check-in must succeed for exactly one of any number of simultaneous scans.
-- Enforced by the application using a single atomic conditional UPDATE:
--   UPDATE bookings SET status = 'checked_in', checked_in_at = now(), checked_in_by = $staff_id
--   WHERE ticket_reference = $1 AND status = 'confirmed'
-- and treating "0 rows affected" as "already checked in / not eligible" (see
-- lib/ticketing/check-in.ts). The uniqueness of ticket_reference (0001) plus
-- this conditional predicate is what makes double check-in impossible without
-- needing a separate application-level lock.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- POLICY ENGINE: a cinema's cancellation policy must never be more lenient
-- than the platform's global limits. Enforced with a trigger (not just app
-- validation) so bad data cannot get in even if application validation is
-- ever bypassed — this was flagged as a named risk in the approved architecture.
-- ---------------------------------------------------------------------------

create or replace function enforce_cinema_policy_within_platform_limits()
returns trigger
language plpgsql
as $$
declare
  v_limits platform_policy_limits%rowtype;
begin
  select * into v_limits from platform_policy_limits order by updated_at desc limit 1;

  -- No global limits configured yet (e.g. Phase 0 / not yet set by admin) —
  -- allow the write; Phase 5 seeds a default row before the policy engine
  -- goes live for real cinemas.
  if v_limits.id is null then
    return new;
  end if;

  if new.cancellation_window_hours < v_limits.min_cancellation_window_hours then
    raise exception
      'cancellation_window_hours (%) is below the platform minimum (%)',
      new.cancellation_window_hours, v_limits.min_cancellation_window_hours;
  end if;

  if new.refund_percentage > v_limits.max_refund_percentage then
    raise exception
      'refund_percentage (%) exceeds the platform maximum (%)',
      new.refund_percentage, v_limits.max_refund_percentage;
  end if;

  return new;
end;
$$;

create trigger cinema_cancellation_policies_enforce_limits
  before insert or update on cinema_cancellation_policies
  for each row execute function enforce_cinema_policy_within_platform_limits();

-- ---------------------------------------------------------------------------
-- Keep booking_seats count within the (configurable) max-seats-per-booking
-- limit at the database layer as a backstop to the application-level check.
-- ---------------------------------------------------------------------------

create or replace function enforce_max_seats_per_booking()
returns trigger
language plpgsql
as $$
declare
  v_max integer;
  v_count integer;
begin
  select max_seats_per_booking into v_max from bookings where id = new.booking_id;
  select count(*) into v_count from booking_seats where booking_id = new.booking_id;

  if v_count >= v_max then
    raise exception 'booking % already has the maximum of % seats', new.booking_id, v_max;
  end if;

  return new;
end;
$$;

create trigger booking_seats_enforce_max
  before insert on booking_seats
  for each row execute function enforce_max_seats_per_booking();
