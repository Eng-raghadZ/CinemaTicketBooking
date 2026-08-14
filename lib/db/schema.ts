/**
 * Drizzle ORM schema — mirrors the SQL of record in /supabase/migrations exactly.
 *
 * IMPORTANT: This file is a typed *read/write client view* of the schema for use in
 * application code (Route Handlers, Server Actions, scheduled jobs). It is NOT the
 * source of truth for constraints, indexes, or RLS policies — those live in the
 * versioned SQL migrations under /supabase/migrations and are applied via
 * `npm run db:migrate`. Drizzle is used here for typed queries, not schema ownership,
 * specifically so RLS policies (which Drizzle cannot express) are never silently
 * bypassed by generated migrations.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------

export const platformRoleEnum = pgEnum("platform_role", [
  "customer",
  "cinema_owner",
  "cinema_staff",
  "platform_admin",
]);

export const cinemaStaffRoleEnum = pgEnum("cinema_staff_role", [
  "owner",
  "manager",
  "staff",
]);

export const cinemaStaffStatusEnum = pgEnum("cinema_staff_status", [
  "invited",
  "active",
  "revoked",
]);

export const cinemaStatusEnum = pgEnum("cinema_status", [
  "pending_review",
  "approved",
  "suspended",
  "rejected",
]);

export const seatHoldStatusEnum = pgEnum("seat_hold_status", [
  "held",
  "booked",
  "released",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "refunded",
  "expired",
  "checked_in",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "booking_confirmed",
  "payment_confirmed",
  "booking_cancelled",
  "refund_confirmed",
  "ticket_delivered",
  "booking_changed",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  // "sms", "push" — added later without a schema rewrite, per architecture v2 Decision 12
]);

export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sent",
  "failed",
]);

// ---------------------------------------------------------------------------
// USERS & ROLES
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), // mirrors auth.users.id (Supabase Auth)
  email: text("email").notNull(),
  fullName: text("full_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A user holds exactly one platform-level role. Cinema-scoped permissions are
// modeled separately in cinema_staff so "owner" and "staff" share one auth path.
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    role: platformRoleEnum("role").notNull().default("customer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// CINEMAS & MULTI-TENANT STAFF
// ---------------------------------------------------------------------------

export const cinemas = pgTable("cinemas", {
  id: uuid("id").primaryKey().defaultRandom(),
  primaryOwnerId: uuid("primary_owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  countryCode: text("country_code").notNull(), // single value in v2 — see Decision 5
  currencyCode: text("currency_code").notNull(), // single value in v2 — see Decision 5
  status: cinemaStatusEnum("status").notNull().default("pending_review"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Single authorization join table for every human who can touch a cinema,
// including its owner (role='owner'). One RLS pattern covers all of them.
export const cinemaStaff = pgTable(
  "cinema_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cinemaId: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: cinemaStaffRoleEnum("role").notNull(),
    permissions: jsonb("permissions").notNull().default(sql`'{}'::jsonb`),
    invitedBy: uuid("invited_by").references(() => users.id),
    status: cinemaStaffStatusEnum("status").notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cinemaUserUnique: uniqueIndex("cinema_staff_cinema_id_user_id_key").on(
      table.cinemaId,
      table.userId,
    ),
    cinemaIdIdx: index("cinema_staff_cinema_id_idx").on(table.cinemaId),
    userIdIdx: index("cinema_staff_user_id_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// SCREENS & SEATS
// ---------------------------------------------------------------------------

export const screens = pgTable(
  "screens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cinemaId: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    layoutConfig: jsonb("layout_config").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cinemaIdIdx: index("screens_cinema_id_idx").on(table.cinemaId),
  }),
);

export const seats = pgTable(
  "seats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    row: text("row").notNull(),
    number: integer("number").notNull(),
    seatType: text("seat_type").notNull().default("standard"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    screenRowNumberUnique: uniqueIndex("seats_screen_id_row_number_key").on(
      table.screenId,
      table.row,
      table.number,
    ),
    screenIdIdx: index("seats_screen_id_idx").on(table.screenId),
  }),
);

// ---------------------------------------------------------------------------
// MOVIES (platform-level catalog — admin-write-only, Section 11 Decision 3)
// ---------------------------------------------------------------------------

export const movies = pgTable("movies", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  posterUrl: text("poster_url"),
  durationMinutes: integer("duration_minutes").notNull(),
  rating: text("rating"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id), // must be a platform_admin — enforced by RLS, not just here
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Which existing catalog titles a cinema shows. Cinema owners/staff may only
// write here, never to `movies` directly.
export const cinemaMovies = pgTable(
  "cinema_movies",
  {
    cinemaId: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),
    movieId: uuid("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "cascade" }),
    addedBy: uuid("added_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: uniqueIndex("cinema_movies_pkey").on(table.cinemaId, table.movieId),
  }),
);

// ---------------------------------------------------------------------------
// SHOWTIMES
// ---------------------------------------------------------------------------

export const showtimes = pgTable(
  "showtimes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cinemaId: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "cascade" }),
    screenId: uuid("screen_id")
      .notNull()
      .references(() => screens.id, { onDelete: "cascade" }),
    movieId: uuid("movie_id")
      .notNull()
      .references(() => movies.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), // stored UTC
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
    currencyCode: text("currency_code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    cinemaIdIdx: index("showtimes_cinema_id_idx").on(table.cinemaId),
    screenStartsAtIdx: index("showtimes_screen_id_starts_at_idx").on(
      table.screenId,
      table.startsAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// SEAT HOLDS & BOOKINGS (concurrency-critical)
// ---------------------------------------------------------------------------

export const seatHolds = pgTable(
  "seat_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    showtimeId: uuid("showtime_id")
      .notNull()
      .references(() => showtimes.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id"), // FK added after bookings table below (circular ref, see migration)
    status: seatHoldStatusEnum("status").notNull().default("held"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The double-booking guard. NOTE: the partial-unique-index form of this
    // constraint (`WHERE status IN ('held','booked')`) is created in raw SQL
    // in the migration, because Drizzle's pgTable index builder cannot express
    // a partial index predicate — see supabase/migrations/0002_constraints.sql.
    showtimeSeatIdx: index("seat_holds_showtime_id_seat_id_idx").on(
      table.showtimeId,
      table.seatId,
    ),
    expiresAtIdx: index("seat_holds_expires_at_idx").on(table.expiresAt),
    userIdIdx: index("seat_holds_user_id_idx").on(table.userId),
  }),
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    cinemaId: uuid("cinema_id")
      .notNull()
      .references(() => cinemas.id, { onDelete: "restrict" }),
    showtimeId: uuid("showtime_id")
      .notNull()
      .references(() => showtimes.id, { onDelete: "restrict" }),
    status: bookingStatusEnum("status").notNull().default("pending"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
    platformFeeAmount: numeric("platform_fee_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"), // commission-ready, commission-off — Section 11 / Decision 1
    currencyCode: text("currency_code").notNull(),
    maxSeatsPerBooking: integer("max_seats_per_booking").notNull().default(8), // enforced server-side too
    ticketReference: uuid("ticket_reference").notNull().defaultRandom(), // unguessable QR payload
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInBy: uuid("checked_in_by").references(() => cinemaStaff.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex("bookings_idempotency_key_key").on(
      table.idempotencyKey,
    ),
    ticketReferenceUnique: uniqueIndex("bookings_ticket_reference_key").on(
      table.ticketReference,
    ),
    userIdIdx: index("bookings_user_id_idx").on(table.userId),
    cinemaIdIdx: index("bookings_cinema_id_idx").on(table.cinemaId),
    showtimeIdIdx: index("bookings_showtime_id_idx").on(table.showtimeId),
  }),
);

export const bookingSeats = pgTable(
  "booking_seats",
  {
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),
  },
  (table) => ({
    pk: uniqueIndex("booking_seats_pkey").on(table.bookingId, table.seatId),
  }),
);

// ---------------------------------------------------------------------------
// POLICY ENGINE (cancellation / refund)
// ---------------------------------------------------------------------------

export const platformPolicyLimits = pgTable("platform_policy_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  minCancellationWindowHours: integer("min_cancellation_window_hours").notNull(),
  maxRefundPercentage: integer("max_refund_percentage").notNull(), // 0-100
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cinemaCancellationPolicies = pgTable(
  "cinema_cancellation_policies",
  {
    cinemaId: uuid("cinema_id")
      .primaryKey()
      .references(() => cinemas.id, { onDelete: "cascade" }),
    cancellationWindowHours: integer("cancellation_window_hours").notNull(),
    refundPercentage: integer("refund_percentage").notNull(), // 0-100
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "restrict" }),
    stripeObjectId: text("stripe_object_id").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    platformFeeAmount: numeric("platform_fee_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    status: text("status").notNull(), // mirrors Stripe PaymentIntent status vocabulary
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    stripeObjectIdUnique: uniqueIndex("payments_stripe_object_id_key").on(
      table.stripeObjectId,
    ),
    bookingIdIdx: index("payments_booking_id_idx").on(table.bookingId),
  }),
);

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").references(() => bookings.id, {
      onDelete: "set null",
    }),
    type: notificationTypeEnum("type").notNull(),
    channel: notificationChannelEnum("channel").notNull().default("email"),
    status: notificationStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
  }),
);

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    entityIdx: index("audit_logs_entity_entity_id_idx").on(table.entity, table.entityId),
    actorIdIdx: index("audit_logs_actor_id_idx").on(table.actorId),
  }),
);

// ---------------------------------------------------------------------------
// RELATIONS (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const cinemasRelations = relations(cinemas, ({ many }) => ({
  staff: many(cinemaStaff),
  screens: many(screens),
  showtimes: many(showtimes),
  bookings: many(bookings),
}));

export const cinemaStaffRelations = relations(cinemaStaff, ({ one }) => ({
  cinema: one(cinemas, { fields: [cinemaStaff.cinemaId], references: [cinemas.id] }),
  user: one(users, { fields: [cinemaStaff.userId], references: [users.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  cinema: one(cinemas, { fields: [bookings.cinemaId], references: [cinemas.id] }),
  showtime: one(showtimes, {
    fields: [bookings.showtimeId],
    references: [showtimes.id],
  }),
  seats: many(bookingSeats),
  payments: many(payments),
}));
