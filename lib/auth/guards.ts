/**
 * Application-layer authorization guards. These run BEFORE any database
 * query, as the first of the architecture's layered checks:
 *   1. Middleware — session presence (middleware.ts)
 *   2. Route Handler — role + tenant check (these functions)
 *   3. RLS — database-level backstop (supabase/migrations/0005_*.sql)
 * A route handler must never skip layer 2 on the assumption that RLS will
 * "catch it" — RLS prevents data leakage, not a correct 401/403 response,
 * and defense in depth means both layers are independently correct.
 */
import { createServerSupabaseClient } from "./server";
import { hasCinemaPermission, type CinemaStaffMembership } from "./permissions";
import type { StaffPermissionKey } from "@/lib/validation/staff";

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this resource") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type PlatformRole = "customer" | "cinema_owner" | "cinema_staff" | "platform_admin";
export type CinemaStaffRole = "owner" | "manager" | "staff";

/** Throws UnauthorizedError if there is no session; otherwise returns the user id. */
export async function requireAuthenticatedUser(): Promise<{ userId: string; email: string | undefined }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError();
  }
  return { userId: user.id, email: user.email };
}

/** Throws ForbiddenError unless the current user is a platform_admin. */
export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const { userId } = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error || data?.role !== "platform_admin") {
    throw new ForbiddenError("Platform administrator access required");
  }
  return { userId };
}

/**
 * Throws ForbiddenError unless the current user has an ACTIVE cinema_staff
 * row for `cinemaId`, optionally restricted to a minimum role tier
 * (owner > manager > staff). This is the check every owner/staff dashboard
 * Route Handler must call with the cinemaId taken from the URL param, never
 * trusted from a request body — the exact "manager for Cinema A rejected
 * server-side if they try to touch Cinema B" guarantee from the approved
 * architecture.
 */
export async function requireCinemaStaff(
  cinemaId: string,
  opts?: { minRole?: CinemaStaffRole },
): Promise<{ userId: string; role: CinemaStaffRole }> {
  const { userId } = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("cinema_staff")
    .select("role, status")
    .eq("cinema_id", cinemaId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    throw new ForbiddenError("You do not have staff access to this cinema");
  }

  const roleRank: Record<CinemaStaffRole, number> = { staff: 0, manager: 1, owner: 2 };
  if (opts?.minRole && roleRank[data.role as CinemaStaffRole] < roleRank[opts.minRole]) {
    throw new ForbiddenError(`Requires ${opts.minRole} role or higher on this cinema`);
  }

  return { userId, role: data.role as CinemaStaffRole };
}

/**
 * Throws ForbiddenError unless the current user is an active owner OR an
 * active manager who has been explicitly granted `permissionKey` (Phase 2
 * hardening — see supabase/migrations/0013_catalog_permission_enforcement.sql
 * for the RLS-layer equivalent, `can_manage_catalog`). An owner always
 * passes, matching that migration's semantics exactly.
 *
 * This is the layer-2 counterpart every catalog Server Action
 * (lib/actions/screens.ts, lib/actions/showtimes.ts) calls before touching
 * the database — RLS remains the authoritative backstop, this is what lets
 * those actions return a friendly, specific error instead of a generic
 * insert failure.
 */
export async function requireCinemaCatalogPermission(
  cinemaId: string,
  permissionKey: StaffPermissionKey,
): Promise<{ userId: string; role: CinemaStaffRole }> {
  const { userId } = await requireCinemaStaff(cinemaId);
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("cinema_staff")
    .select("role, status, permissions")
    .eq("cinema_id", cinemaId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !hasCinemaPermission(data as CinemaStaffMembership | null, permissionKey)) {
    throw new ForbiddenError(`Requires the "${permissionKey}" permission on this cinema`);
  }

  return { userId, role: (data as CinemaStaffMembership).role };
}

/** True if the current session belongs to a platform_admin — non-throwing variant for conditional UI logic. */
export async function isPlatformAdmin(): Promise<boolean> {
  try {
    await requirePlatformAdmin();
    return true;
  } catch {
    return false;
  }
}
