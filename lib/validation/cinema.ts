/**
 * Validation for cinema onboarding (Phase 1). Kept separate from the
 * database layer so Route Handlers/Server Actions can reject bad input with
 * a clean 400/field-error response before ever touching Postgres — RLS and
 * the 0004 triggers remain the authoritative backstop, this is just the
 * fast, friendly first line (see docs/security.md's three-layer model).
 */
import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

export const registerCinemaSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(200),
  description: optionalTrimmed(2000),
  location: optionalTrimmed(500),
  // Single-currency-per-cinema is enforced in application logic, not schema,
  // per architecture-plan.md Decision 5 — this validates the *shape* only.
  countryCode: z
    .string()
    .trim()
    .length(2, "countryCode must be a 2-letter ISO 3166-1 alpha-2 code")
    .transform((v) => v.toUpperCase()),
  currencyCode: z
    .string()
    .trim()
    .length(3, "currencyCode must be a 3-letter ISO 4217 code")
    .transform((v) => v.toUpperCase()),
});

export type RegisterCinemaInput = z.infer<typeof registerCinemaSchema>;

export const cinemaIdSchema = z.object({
  cinemaId: z.string().uuid(),
});

export const rejectCinemaSchema = z.object({
  cinemaId: z.string().uuid(),
  rejectionReason: z
    .string()
    .trim()
    .min(10, "Provide a reason of at least 10 characters")
    .max(1000),
});
