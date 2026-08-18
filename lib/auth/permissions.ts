/**
 * Pure permission logic, mirrored 1:1 with the SQL `can_manage_cinema_staff`
 * function in supabase/migrations/0003_rls_helper_functions.sql. Kept here,
 * DB-free, so it's unit-testable and so Server Actions can give a correct,
 * friendly error BEFORE the database is even queried, rather than relying on
 * RLS (layer 3) to silently deny with zero rows affected.
 *
 * IMPORTANT: if this logic and the SQL function ever diverge, RLS remains
 * authoritative — this is a pre-check for UX and layer-2 defense-in-depth,
 * never a replacement for the database-level guarantee.
 */
import type { CinemaStaffRole } from "./guards";

export type CinemaStaffStatus = "invited" | "active" | "revoked";

export interface CinemaStaffMembership {
  role: CinemaStaffRole;
  status: CinemaStaffStatus;
  permissions?: Record<string, boolean | null | undefined> | null;
}

export function canManageCinemaStaff(membership: CinemaStaffMembership | null | undefined): boolean {
  if (!membership || membership.status !== "active") return false;
  if (membership.role === "owner") return true;
  if (membership.role === "manager") {
    return membership.permissions?.manage_staff === true;
  }
  return false;
}

const ROLE_RANK: Record<CinemaStaffRole, number> = { staff: 0, manager: 1, owner: 2 };

export function hasMinCinemaStaffRole(
  membership: Pick<CinemaStaffMembership, "role" | "status"> | null | undefined,
  minRole: CinemaStaffRole,
): boolean {
  if (!membership || membership.status !== "active") return false;
  return ROLE_RANK[membership.role] >= ROLE_RANK[minRole];
}
