/**
 * Validation for Phase 2 (Catalog Management): the master movie catalog,
 * a cinema's selection of catalog titles, screens/seat-grid generation,
 * and showtimes.
 *
 * Same pattern as lib/validation/cinema.ts and lib/validation/staff.ts:
 * this is the fast, friendly first line (a Route Handler/Server Action can
 * reject bad input with a clean field-error response before ever touching
 * Postgres). RLS (supabase/migrations/0005_rls_policies.sql) and, where
 * relevant, application-level checks in lib/actions/* remain the
 * authoritative backstop — this module never decides authorization, only
 * shape.
 */
import { z } from "zod";
import { SEAT_TYPES, MIN_ROWS, MAX_ROWS, MIN_SEATS_PER_ROW, MAX_SEATS_PER_ROW } from "@/lib/catalog/seat-layout";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

// ---------------------------------------------------------------------------
// MOVIES — platform-admin-only master catalog (architecture-plan.md
// Section 11, Decision 3). Cinema owners never create/edit a `movies` row —
// see cinemaMovieSchema below for the only write path available to them.
// ---------------------------------------------------------------------------

export const movieSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: optionalTrimmed(5000),
  posterUrl: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
  durationMinutes: z.coerce
    .number()
    .int("Duration must be a whole number of minutes")
    .positive("Duration must be greater than 0")
    .max(1000, "Duration seems unreasonably long"),
  rating: optionalTrimmed(20),
});
export type MovieInput = z.infer<typeof movieSchema>;

export const movieIdSchema = z.object({
  movieId: z.string().uuid(),
});

export const updateMovieSchema = movieSchema.extend({
  movieId: z.string().uuid(),
});
export type UpdateMovieInput = z.infer<typeof updateMovieSchema>;

// ---------------------------------------------------------------------------
// CINEMA_MOVIES — a cinema's selection of existing catalog titles. This is
// the ONLY catalog write path available to a cinema owner/manager.
// ---------------------------------------------------------------------------

export const cinemaMovieSchema = z.object({
  cinemaId: z.string().uuid(),
  movieId: z.string().uuid(),
});
export type CinemaMovieInput = z.infer<typeof cinemaMovieSchema>;

// ---------------------------------------------------------------------------
// SCREENS — created with a uniform seat grid in one step (see
// lib/catalog/seat-layout.ts). Bounds mirror the generator's own limits so
// a validation failure is reported before generation is even attempted.
// ---------------------------------------------------------------------------

export const screenSeatTypeSchema = z.enum(SEAT_TYPES);

export const createScreenSchema = z.object({
  cinemaId: z.string().uuid(),
  name: z.string().trim().min(1, "Screen name is required").max(100),
  rows: z.coerce
    .number()
    .int()
    .min(MIN_ROWS, `Must have at least ${MIN_ROWS} row`)
    .max(MAX_ROWS, `Cannot exceed ${MAX_ROWS} rows`),
  seatsPerRow: z.coerce
    .number()
    .int()
    .min(MIN_SEATS_PER_ROW, `Must have at least ${MIN_SEATS_PER_ROW} seat per row`)
    .max(MAX_SEATS_PER_ROW, `Cannot exceed ${MAX_SEATS_PER_ROW} seats per row`),
  seatType: screenSeatTypeSchema.default("standard"),
});
export type CreateScreenInput = z.infer<typeof createScreenSchema>;

export const screenIdSchema = z.object({
  cinemaId: z.string().uuid(),
  screenId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// SHOWTIMES — currencyCode is deliberately NOT accepted here. Per
// architecture-plan.md / prior decisions, currency is always read
// server-side from the cinema record, never client-supplied. basePrice is
// validated as a plain non-negative number; the server action is
// responsible for combining it with the cinema's currency_code.
// ---------------------------------------------------------------------------

export const createShowtimeSchema = z.object({
  cinemaId: z.string().uuid(),
  screenId: z.string().uuid(),
  movieId: z.string().uuid(),
  startsAt: z
    .string()
    .min(1, "Start time is required")
    .transform((v, ctx) => {
      const date = new Date(v);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date/time" });
        return z.NEVER;
      }
      return date;
    })
    .refine((date) => date.getTime() > Date.now(), {
      message: "Showtime must be in the future",
    }),
  basePrice: z.coerce
    .number()
    .nonnegative("Price cannot be negative")
    .max(100000, "Price seems unreasonably high")
    .multipleOf(0.01, "Price can have at most 2 decimal places"),
});
export type CreateShowtimeInput = z.infer<typeof createShowtimeSchema>;

export const showtimeIdSchema = z.object({
  cinemaId: z.string().uuid(),
  showtimeId: z.string().uuid(),
});

export const updateShowtimePriceSchema = z.object({
  cinemaId: z.string().uuid(),
  showtimeId: z.string().uuid(),
  basePrice: z.coerce
    .number()
    .nonnegative("Price cannot be negative")
    .max(100000, "Price seems unreasonably high")
    .multipleOf(0.01, "Price can have at most 2 decimal places"),
});
export type UpdateShowtimePriceInput = z.infer<typeof updateShowtimePriceSchema>;
