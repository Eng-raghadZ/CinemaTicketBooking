/**
 * Validation for cinema_staff invites (Phase 1).
 *
 * `permissions` is jsonb in the database for forward compatibility, but the
 * architecture doc (Section 10, "Risks") explicitly flags free-form JSON
 * permissions as an audit risk and recommends "a small fixed permission set
 * per role rather than fully free-form JSON." STAFF_PERMISSION_KEYS is that
 * fixed vocabulary, enforced here at the application layer via `.strict()`
 * so an unrecognized key is rejected rather than silently stored.
 */
import { z } from "zod";

export const STAFF_PERMISSION_KEYS = [
  "manage_staff",
  "manage_showtimes",
  "manage_pricing",
  "manage_screens",
  "view_bookings",
  "manage_bookings",
  "check_in_tickets",
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];

export const staffPermissionsSchema = z
  .object(
    Object.fromEntries(
      STAFF_PERMISSION_KEYS.map((key) => [key, z.boolean().optional()]),
    ) as Record<StaffPermissionKey, z.ZodOptional<z.ZodBoolean>>,
  )
  .strict();

// 'owner' is deliberately excluded — ownership is granted only via the
// 0008_cinema_owner_bootstrap.sql trigger at cinema-creation time, never
// through the invite flow, so there is exactly one path to "owner" status.
export const invitableCinemaStaffRoleSchema = z.enum(["manager", "staff"]);

export const inviteStaffSchema = z.object({
  cinemaId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: invitableCinemaStaffRoleSchema,
  permissions: staffPermissionsSchema.optional().default({}),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
