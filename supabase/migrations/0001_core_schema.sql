-- 0001_core_schema.sql
-- Core schema for the multi-cinema booking platform (Architecture v2, Phase 0).
-- Mirrors lib/db/schema.ts. Applied in order; do not renumber existing files.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

create type platform_role as enum ('customer', 'cinema_owner', 'cinema_staff', 'platform_admin');
create type cinema_staff_role as enum ('owner', 'manager', 'staff');
create type cinema_staff_status as enum ('invited', 'active', 'revoked');
create type cinema_status as enum ('pending_review', 'approved', 'suspended', 'rejected');
create type seat_hold_status as enum ('held', 'booked', 'released');
create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'refunded', 'expired', 'checked_in');
create type notification_type as enum (
  'booking_confirmed', 'payment_confirmed', 'booking_cancelled',
  'refund_confirmed', 'ticket_delivered', 'booking_changed'
);
-- channel is extendable to 'sms'/'push' later via ALTER TYPE ... ADD VALUE — no table rewrite needed
create type notification_channel as enum ('email');
create type notification_status as enum ('pending', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- USERS & ROLES
-- Note: in production, `users` mirrors auth.users (Supabase Auth) via a trigger
-- (see 0006_auth_sync.sql). id values are shared 1:1 with auth.users.id.
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));

create table user_roles (
  user_id uuid primary key references users(id) on delete cascade,
  role platform_role not null default 'customer',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CINEMAS & STAFF
-- ---------------------------------------------------------------------------

create table cinemas (
  id uuid primary key default gen_random_uuid(),
  primary_owner_id uuid not null references users(id) on delete restrict,
  name text not null,
  description text,
  location text,
  country_code text not null,
  currency_code text not null,
  status cinema_status not null default 'pending_review',
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index cinemas_status_idx on cinemas (status);
create index cinemas_primary_owner_id_idx on cinemas (primary_owner_id);

create table cinema_staff (
  id uuid primary key default gen_random_uuid(),
  cinema_id uuid not null references cinemas(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role cinema_staff_role not null,
  permissions jsonb not null default '{}'::jsonb,
  invited_by uuid references users(id),
  status cinema_staff_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique (cinema_id, user_id)
);
create index cinema_staff_cinema_id_idx on cinema_staff (cinema_id);
create index cinema_staff_user_id_idx on cinema_staff (user_id);

-- ---------------------------------------------------------------------------
-- SCREENS & SEATS
-- ---------------------------------------------------------------------------

create table screens (
  id uuid primary key default gen_random_uuid(),
  cinema_id uuid not null references cinemas(id) on delete cascade,
  name text not null,
  layout_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index screens_cinema_id_idx on screens (cinema_id);

create table seats (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null references screens(id) on delete cascade,
  row text not null,
  number integer not null,
  seat_type text not null default 'standard',
  created_at timestamptz not null default now(),
  unique (screen_id, row, number)
);
create index seats_screen_id_idx on seats (screen_id);

-- ---------------------------------------------------------------------------
-- MOVIES (platform catalog) & CINEMA_MOVIES
-- ---------------------------------------------------------------------------

create table movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  poster_url text,
  duration_minutes integer not null check (duration_minutes > 0),
  rating text,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index movies_title_idx on movies (title);

create table cinema_movies (
  cinema_id uuid not null references cinemas(id) on delete cascade,
  movie_id uuid not null references movies(id) on delete cascade,
  added_by uuid references users(id),
  created_at timestamptz not null default now(),
  primary key (cinema_id, movie_id)
);

-- ---------------------------------------------------------------------------
-- SHOWTIMES
-- ---------------------------------------------------------------------------

create table showtimes (
  id uuid primary key default gen_random_uuid(),
  cinema_id uuid not null references cinemas(id) on delete cascade,
  screen_id uuid not null references screens(id) on delete cascade,
  movie_id uuid not null references movies(id) on delete restrict,
  starts_at timestamptz not null, -- always stored UTC; render in cinema-local tz in the app layer
  base_price numeric(10,2) not null check (base_price >= 0),
  currency_code text not null,
  created_at timestamptz not null default now()
);
create index showtimes_cinema_id_idx on showtimes (cinema_id);
create index showtimes_screen_id_starts_at_idx on showtimes (screen_id, starts_at);

-- ---------------------------------------------------------------------------
-- SEAT HOLDS & BOOKINGS
-- ---------------------------------------------------------------------------

create table seat_holds (
  id uuid primary key default gen_random_uuid(),
  showtime_id uuid not null references showtimes(id) on delete cascade,
  seat_id uuid not null references seats(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  booking_id uuid, -- FK added in 0002 after bookings exists (avoids circular create-order issues)
  status seat_hold_status not null default 'held',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index seat_holds_expires_at_idx on seat_holds (expires_at);
create index seat_holds_user_id_idx on seat_holds (user_id);
create index seat_holds_showtime_id_seat_id_idx on seat_holds (showtime_id, seat_id);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  cinema_id uuid not null references cinemas(id) on delete restrict,
  showtime_id uuid not null references showtimes(id) on delete restrict,
  status booking_status not null default 'pending',
  stripe_payment_intent_id text,
  idempotency_key text not null,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  platform_fee_amount numeric(10,2) not null default 0 check (platform_fee_amount >= 0),
  currency_code text not null,
  max_seats_per_booking integer not null default 8 check (max_seats_per_booking > 0),
  ticket_reference uuid not null default gen_random_uuid(),
  checked_in_at timestamptz,
  checked_in_by uuid references cinema_staff(id),
  created_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (ticket_reference)
);
create index bookings_user_id_idx on bookings (user_id);
create index bookings_cinema_id_idx on bookings (cinema_id);
create index bookings_showtime_id_idx on bookings (showtime_id);
create index bookings_status_idx on bookings (status);

create table booking_seats (
  booking_id uuid not null references bookings(id) on delete cascade,
  seat_id uuid not null references seats(id) on delete restrict,
  primary key (booking_id, seat_id)
);

-- ---------------------------------------------------------------------------
-- POLICY ENGINE
-- ---------------------------------------------------------------------------

create table platform_policy_limits (
  id uuid primary key default gen_random_uuid(),
  min_cancellation_window_hours integer not null check (min_cancellation_window_hours >= 0),
  max_refund_percentage integer not null check (max_refund_percentage between 0 and 100),
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table cinema_cancellation_policies (
  cinema_id uuid primary key references cinemas(id) on delete cascade,
  cancellation_window_hours integer not null check (cancellation_window_hours >= 0),
  refund_percentage integer not null check (refund_percentage between 0 and 100),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------------

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete restrict,
  stripe_object_id text not null,
  amount numeric(10,2) not null check (amount >= 0),
  platform_fee_amount numeric(10,2) not null default 0 check (platform_fee_amount >= 0),
  status text not null,
  created_at timestamptz not null default now(),
  unique (stripe_object_id)
);
create index payments_booking_id_idx on payments (booking_id);

-- ---------------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  type notification_type not null,
  channel notification_channel not null default 'email',
  status notification_status not null default 'pending',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_id_idx on notifications (user_id);

-- ---------------------------------------------------------------------------
-- AUDIT LOG
-- ---------------------------------------------------------------------------

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_entity_id_idx on audit_logs (entity, entity_id);
create index audit_logs_actor_id_idx on audit_logs (actor_id);
