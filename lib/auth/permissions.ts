/**
 * Pure permission logic, mirrored 1:1 with the SQL helper functions in
 * supabase/migrations/0003_rls_helper_functions.sql (`can_manage_cinema_staff`,
 * 'manage_staff' only) and 0013_catalog_permission_enforcement.sql
 * (`can_manage_catalog`, any permission key). Kept here, DB-free, so it's
 * unit-testable and so Server Actions can give a correct, friendly error
 * BEFORE the database is even queried, rather than relying on RLS (layer 3)
 * to silently deny with zero rows affected.
 *
 * IMPORTANT: if this logic and the SQL functions ever diverge, RLS remains
 * authoritative — this is a pre-check for UX and layer-2 defense-in-depth,
 * never a replacement for the database-level guarantee.
 */
import type { CinemaStaffRole } from "./guards";
import type { StaffPermissionKey } from "@/lib/validation/staff";

export type CinemaStaffStatus = "invited" | "active" | "revoked";

export interface CinemaStaffMembership {
  role: CinemaStaffRole;
  status: CinemaStaffStatus;
  permissions?: Record<string, boolean | null | undefined> | null;
}

/**
 * Generic "owner OR manager-with-this-key" check, mirroring the SQL
 * `can_manage_catalog(cinema_id, permission_key)` function. This is the
 * single source of truth for that interpretation on the TypeScript side —
 * `canManageCinemaStaff` below is defined in terms of it (for the
 * 'manage_staff' key) rather than re-implementing the same logic, and
 * every Phase 2 catalog permission check (manage_screens, manage_showtimes,
 * manage_pricing) uses it directly via `requireCinemaCatalogPermission`
 * (lib/auth/guards.ts).
 */
export function hasCinemaPermission(
  membership: CinemaStaffMembership | null | undefined,
  permissionKey: StaffPermissionKey,
): boolean {
  if (!membership || membership.status !== "active") return false;
  if (membership.role === "owner") return true;
  if (membership.role === "manager") {
    return membership.permissions?.[permissionKey] === true;
  }
  return false;
}

export function canManageCinemaStaff(membership: CinemaStaffMembership | null | undefined): boolean {
  return hasCinemaPermission(membership, "manage_staff");
}

const ROLE_RANK: Record<CinemaStaffRole, number> = { staff: 0, manager: 1, owner: 2 };

export function hasMinCinemaStaffRole(
  membership: Pick<CinemaStaffMembership, "role" | "status"> | null | undefined,
  minRole: CinemaStaffRole,
): boolean {
  if (!membership || membership.status !== "active") return false;
  return ROLE_RANK[membership.role] >= ROLE_RANK[minRole];
}
