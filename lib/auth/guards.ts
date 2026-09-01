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
import { redirect } from "next/navigation";
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

/**
 * Friendly-redirect destinations for the two authorization errors above.
 * Kept as plain string constants (not next/navigation calls) so the mapping
 * function below has zero framework dependency and is trivially unit
 * testable — see tests/unit/auth-error-routing.test.ts.
 */
export const LOGIN_REDIRECT_PATH = "/login";
export const ACCESS_DENIED_REDIRECT_PATH = "/access-denied";

/**
 * Pure classification: given whatever a guard function threw, returns the
 * friendly route it should redirect to, or `null` if this isn't one of our
 * recognized authorization errors (in which case the caller must rethrow
 * rather than swallow it — an unexpected error is a real bug, not an
 * expected "you don't have access" outcome, and must not be silently
 * turned into a redirect).
 */
export function resolveAuthErrorRedirectPath(error: unknown): string | null {
  if (error instanceof UnauthorizedError) return LOGIN_REDIRECT_PATH;
  if (error instanceof ForbiddenError) return ACCESS_DENIED_REDIRECT_PATH;
  return null;
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

/**
 * Server-Component-friendly wrapper around `requireCinemaStaff`. This does
 * NOT change what's authorized — it calls the exact same guard (same
 * database query, same RLS-backed authorization) and only changes what
 * happens with the resulting error: instead of an uncaught throw reaching
 * the user as a raw Next.js error overlay / stack trace, an expected
 * ForbiddenError/UnauthorizedError is turned into a `redirect()` to a
 * friendly page, using the stable App Router pattern of catching the error
 * and calling `redirect()` from inside the `catch` block. Any OTHER error
 * (a real bug, a database outage, etc.) is rethrown unchanged and still
 * surfaces normally (caught by the nearest error boundary) — this wrapper
 * only ever intercepts the two recognized, expected authorization errors.
 */
export async function requireCinemaStaffOrRedirect(
  cinemaId: string,
  opts?: { minRole?: CinemaStaffRole },
): Promise<{ userId: string; role: CinemaStaffRole }> {
  try {
    return await requireCinemaStaff(cinemaId, opts);
  } catch (error) {
    const redirectPath = resolveAuthErrorRedirectPath(error);
    if (redirectPath) {
      redirect(redirectPath);
    }
    throw error;
  }
}

/** Same pattern as `requireCinemaStaffOrRedirect`, for `requirePlatformAdmin`. */
export async function requirePlatformAdminOrRedirect(): Promise<{ userId: string }> {
  try {
    return await requirePlatformAdmin();
  } catch (error) {
    const redirectPath = resolveAuthErrorRedirectPath(error);
    if (redirectPath) {
      redirect(redirectPath);
    }
    throw error;
  }
}
