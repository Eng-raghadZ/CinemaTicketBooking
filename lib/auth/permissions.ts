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

/**
 * "Manage X" vs plain "X" — a read-only staff member should never see nav
 * wording that implies management access they don't have (pre-UI
 * observation: the cinema dashboard used identical management-oriented
 * links for owners, managers, and read-only staff). One tiny pure helper
 * instead of four copy-pasted ternaries at each call site.
 */
export function cinemaManagementLabel(canManage: boolean, resource: string): string {
  const readOnlyLabel = resource.charAt(0).toUpperCase() + resource.slice(1);
  return canManage ? `Manage ${resource}` : readOnlyLabel;
}

export interface CinemaDashboardNavLabels {
  staff: string;
  movies: string;
  screens: string;
  showtimes: string;
}

/**
 * Computes the cinema-dashboard nav labels from one membership row,
 * mirroring the exact permission each destination page's own management UI
 * already requires:
 *   - staff:     canManageCinemaStaff       (staff/page.tsx)
 *   - movies:    hasMinCinemaStaffRole(...,'manager') (movies/page.tsx — cinema_movies_write is role-tier only, no dedicated permission key exists yet)
 *   - screens:   hasCinemaPermission(...,'manage_screens')   (screens/page.tsx)
 *   - showtimes: hasCinemaPermission(...,'manage_showtimes') OR
 *                hasCinemaPermission(...,'manage_pricing')  (showtimes/page.tsx exposes
 *                both scheduling and price-only actions on that one page)
 * so the top-level dashboard nav never promises more management access
 * than the destination page actually grants. Read-only staff still get
 * every link (browsing is not restricted here) — only the wording changes.
 */
export function cinemaDashboardNavLabels(
  membership: CinemaStaffMembership | null | undefined,
): CinemaDashboardNavLabels {
  return {
    staff: cinemaManagementLabel(canManageCinemaStaff(membership), "staff"),
    movies: cinemaManagementLabel(hasMinCinemaStaffRole(membership, "manager"), "movies"),
    screens: cinemaManagementLabel(hasCinemaPermission(membership, "manage_screens"), "screens"),
    showtimes: cinemaManagementLabel(
      hasCinemaPermission(membership, "manage_showtimes") ||
        hasCinemaPermission(membership, "manage_pricing"),
      "showtimes",
    ),
  };
}
