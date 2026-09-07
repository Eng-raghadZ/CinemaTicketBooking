import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the Part 7 fix: `/dashboard/cinemas` and
 * `/dashboard/movies` used the raw, throwing `requirePlatformAdmin()`
 * instead of the existing `requirePlatformAdminOrRedirect()` wrapper, so an
 * authenticated non-admin owner hit Next's unhandled Runtime Error overlay
 * instead of a controlled access-denied page. These tests exercise the
 * WRAPPER functions themselves (`requirePlatformAdminOrRedirect`,
 * `requireCinemaStaffOrRedirect`) directly — the same functions the two
 * fixed page files now call — with `@/lib/auth/server` and `next/navigation`
 * mocked, since a real Supabase session/cookie context isn't available in a
 * unit test.
 */

const mockRedirect = vi.fn((path: string) => {
  // Mirrors Next.js's real behavior: redirect() always throws (a special
  // NEXT_REDIRECT digest error) to unwind the render — callers must not
  // catch it themselves. Encoding the path in the thrown message lets
  // these tests assert exactly which path was requested.
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

interface FakeSessionOptions {
  user: { id: string; email?: string } | null;
  platformRole?: string | null;
  cinemaStaffRow?: { role: string; status: string } | null;
  /** If set, auth.getUser() itself rejects — simulates a genuine, non-auth failure. */
  getUserThrows?: Error;
}

let session: FakeSessionOptions;

function makeFakeSupabase(opts: FakeSessionOptions) {
  return {
    auth: {
      getUser: async () => {
        if (opts.getUserThrows) throw opts.getUserThrows;
        return opts.user
          ? { data: { user: opts.user }, error: null }
          : { data: { user: null }, error: new Error("no session") };
      },
    },
    from: (table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                opts.platformRole
                  ? { data: { role: opts.platformRole }, error: null }
                  : { data: null, error: new Error("not found") },
            }),
          }),
        };
      }
      if (table === "cinema_staff") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: opts.cinemaStaffRow ?? null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test fake: ${table}`);
    },
  };
}

vi.mock("@/lib/auth/server", () => ({
  createServerSupabaseClient: async () => makeFakeSupabase(session),
}));

// Imported AFTER the mocks are declared (vi.mock calls are hoisted by
// Vitest regardless of source order, but writing it this way keeps intent
// clear): these are the real, unmodified guard functions from
// lib/auth/guards.ts.
const {
  requirePlatformAdminOrRedirect,
  requireCinemaStaffOrRedirect,
  ACCESS_DENIED_REDIRECT_PATH,
  LOGIN_REDIRECT_PATH,
} = await import("@/lib/auth/guards");

beforeEach(() => {
  mockRedirect.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("requirePlatformAdminOrRedirect", () => {
  it("redirects to /access-denied for an authenticated non-admin user (the exact bug this fixes)", async () => {
    session = { user: { id: "owner-1" }, platformRole: "cinema_owner" };
    await expect(requirePlatformAdminOrRedirect()).rejects.toThrow(
      `NEXT_REDIRECT:${ACCESS_DENIED_REDIRECT_PATH}`,
    );
    expect(mockRedirect).toHaveBeenCalledWith(ACCESS_DENIED_REDIRECT_PATH);
    expect(mockRedirect).toHaveBeenCalledTimes(1);
  });

  it("redirects to /login for an unauthenticated visitor", async () => {
    session = { user: null };
    await expect(requirePlatformAdminOrRedirect()).rejects.toThrow(`NEXT_REDIRECT:${LOGIN_REDIRECT_PATH}`);
    expect(mockRedirect).toHaveBeenCalledWith(LOGIN_REDIRECT_PATH);
  });

  it("returns normally for an actual platform_admin (no redirect at all)", async () => {
    session = { user: { id: "admin-1" }, platformRole: "platform_admin" };
    const result = await requirePlatformAdminOrRedirect();
    expect(result).toEqual({ userId: "admin-1" });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does NOT convert a genuine unexpected error into a controlled redirect", async () => {
    session = { user: null, getUserThrows: new Error("database connection lost") };
    await expect(requirePlatformAdminOrRedirect()).rejects.toThrow("database connection lost");
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("requireCinemaStaffOrRedirect (same shared mechanism, sanity-checked)", () => {
  it("redirects to /access-denied when the user has no staff row for the cinema", async () => {
    session = { user: { id: "customer-1" }, cinemaStaffRow: null };
    await expect(requireCinemaStaffOrRedirect("11111111-1111-4111-8111-111111111111")).rejects.toThrow(
      `NEXT_REDIRECT:${ACCESS_DENIED_REDIRECT_PATH}`,
    );
  });

  it("redirects to /login for an unauthenticated visitor", async () => {
    session = { user: null };
    await expect(requireCinemaStaffOrRedirect("11111111-1111-4111-8111-111111111111")).rejects.toThrow(
      `NEXT_REDIRECT:${LOGIN_REDIRECT_PATH}`,
    );
  });

  it("returns normally for an active staff member", async () => {
    session = { user: { id: "staff-1" }, cinemaStaffRow: { role: "manager", status: "active" } };
    const result = await requireCinemaStaffOrRedirect("11111111-1111-4111-8111-111111111111");
    expect(result).toEqual({ userId: "staff-1", role: "manager" });
  });
});
