import { describe, expect, it } from "vitest";
import {
  canManageCinemaStaff,
  cinemaDashboardNavLabels,
  cinemaManagementLabel,
  hasCinemaPermission,
  hasMinCinemaStaffRole,
} from "@/lib/auth/permissions";

describe("canManageCinemaStaff", () => {
  it("returns false for a null membership", () => {
    expect(canManageCinemaStaff(null)).toBe(false);
  });

  it("returns false for a revoked membership even if the role is owner", () => {
    expect(canManageCinemaStaff({ role: "owner", status: "revoked" })).toBe(false);
  });

  it("returns false for an invited (not yet accepted) membership", () => {
    expect(canManageCinemaStaff({ role: "owner", status: "invited" })).toBe(false);
  });

  it("returns true for an active owner", () => {
    expect(canManageCinemaStaff({ role: "owner", status: "active" })).toBe(true);
  });

  it("returns false for an active manager without the manage_staff permission", () => {
    expect(canManageCinemaStaff({ role: "manager", status: "active", permissions: {} })).toBe(false);
  });

  it("returns true for an active manager explicitly granted manage_staff", () => {
    expect(
      canManageCinemaStaff({ role: "manager", status: "active", permissions: { manage_staff: true } }),
    ).toBe(true);
  });

  it("returns false for an active staff-tier member regardless of permissions jsonb", () => {
    expect(
      canManageCinemaStaff({ role: "staff", status: "active", permissions: { manage_staff: true } }),
    ).toBe(false);
  });
});

describe("hasCinemaPermission (Phase 2 hardening — generic catalog permission check)", () => {
  it("returns false for a null membership", () => {
    expect(hasCinemaPermission(null, "manage_screens")).toBe(false);
  });

  it("returns false for a revoked or invited membership even for an owner", () => {
    expect(hasCinemaPermission({ role: "owner", status: "revoked" }, "manage_screens")).toBe(false);
    expect(hasCinemaPermission({ role: "owner", status: "invited" }, "manage_showtimes")).toBe(false);
  });

  it("returns true for an active owner regardless of permissions jsonb content", () => {
    expect(hasCinemaPermission({ role: "owner", status: "active", permissions: {} }, "manage_screens")).toBe(
      true,
    );
    expect(hasCinemaPermission({ role: "owner", status: "active" }, "manage_pricing")).toBe(true);
  });

  it("returns false for an active staff-tier member regardless of permissions jsonb", () => {
    expect(
      hasCinemaPermission(
        { role: "staff", status: "active", permissions: { manage_screens: true } },
        "manage_screens",
      ),
    ).toBe(false);
  });

  it("returns false for a manager without the specific key granted", () => {
    expect(
      hasCinemaPermission({ role: "manager", status: "active", permissions: {} }, "manage_screens"),
    ).toBe(false);
    expect(
      hasCinemaPermission(
        { role: "manager", status: "active", permissions: { manage_staff: true } },
        "manage_showtimes",
      ),
    ).toBe(false);
  });

  it("returns true for a manager with the specific key explicitly granted", () => {
    expect(
      hasCinemaPermission(
        { role: "manager", status: "active", permissions: { manage_screens: true } },
        "manage_screens",
      ),
    ).toBe(true);
  });

  it("does NOT let one catalog permission imply another — manage_showtimes does not imply manage_pricing", () => {
    const membership = { role: "manager" as const, status: "active" as const, permissions: { manage_showtimes: true } };
    expect(hasCinemaPermission(membership, "manage_showtimes")).toBe(true);
    expect(hasCinemaPermission(membership, "manage_pricing")).toBe(false);
    expect(hasCinemaPermission(membership, "manage_screens")).toBe(false);
  });

  it("does NOT let manage_pricing imply manage_screens", () => {
    const membership = { role: "manager" as const, status: "active" as const, permissions: { manage_pricing: true } };
    expect(hasCinemaPermission(membership, "manage_pricing")).toBe(true);
    expect(hasCinemaPermission(membership, "manage_screens")).toBe(false);
  });

  it("does NOT let manage_screens imply manage_showtimes", () => {
    const membership = { role: "manager" as const, status: "active" as const, permissions: { manage_screens: true } };
    expect(hasCinemaPermission(membership, "manage_screens")).toBe(true);
    expect(hasCinemaPermission(membership, "manage_showtimes")).toBe(false);
  });

  it("a manager holding all three catalog permissions passes all three checks independently", () => {
    const membership = {
      role: "manager" as const,
      status: "active" as const,
      permissions: { manage_screens: true, manage_showtimes: true, manage_pricing: true },
    };
    expect(hasCinemaPermission(membership, "manage_screens")).toBe(true);
    expect(hasCinemaPermission(membership, "manage_showtimes")).toBe(true);
    expect(hasCinemaPermission(membership, "manage_pricing")).toBe(true);
  });

  it("canManageCinemaStaff is defined in terms of hasCinemaPermission for 'manage_staff' (no duplicated interpretation)", () => {
    const membership = { role: "manager" as const, status: "active" as const, permissions: { manage_staff: true } };
    expect(canManageCinemaStaff(membership)).toBe(hasCinemaPermission(membership, "manage_staff"));
  });
});

describe("cinemaManagementLabel (pre-UI observation: permission-aware nav wording)", () => {
  it("prefixes the resource with 'Manage' when the caller can manage it", () => {
    expect(cinemaManagementLabel(true, "staff")).toBe("Manage staff");
  });

  it("returns the plain resource name when the caller cannot manage it", () => {
    expect(cinemaManagementLabel(false, "staff")).toBe("Staff");
  });
});

describe("cinemaDashboardNavLabels", () => {
  it("gives an active owner full 'Manage X' wording for every link", () => {
    const labels = cinemaDashboardNavLabels({ role: "owner", status: "active", permissions: {} });
    expect(labels).toEqual({
      staff: "Manage staff",
      movies: "Manage movies",
      screens: "Manage screens",
      showtimes: "Manage showtimes",
    });
  });

  it("gives a read-only 'staff' role member plain wording on every link — links are still present, not hidden", () => {
    const labels = cinemaDashboardNavLabels({ role: "staff", status: "active", permissions: {} });
    expect(labels).toEqual({
      staff: "Staff",
      movies: "Movies",
      screens: "Screens",
      showtimes: "Showtimes",
    });
  });

  it("a manager only sees 'Manage X' for the specific keys they were granted", () => {
    const labels = cinemaDashboardNavLabels({
      role: "manager",
      status: "active",
      permissions: { manage_screens: true },
    });
    expect(labels.screens).toBe("Manage screens");
    expect(labels.staff).toBe("Staff");
    // movies is role-tier only (no dedicated permission key exists for
    // cinema_movies — see the "movies" test below), so ANY active manager
    // gets "Manage movies" regardless of which other keys they hold.
    expect(labels.movies).toBe("Manage movies");
    expect(labels.showtimes).toBe("Showtimes");
  });

  it("showtimes is 'Manage showtimes' if the manager holds EITHER manage_showtimes or manage_pricing (both actions live on that one page)", () => {
    const schedulingOnly = cinemaDashboardNavLabels({
      role: "manager",
      status: "active",
      permissions: { manage_showtimes: true },
    });
    expect(schedulingOnly.showtimes).toBe("Manage showtimes");

    const pricingOnly = cinemaDashboardNavLabels({
      role: "manager",
      status: "active",
      permissions: { manage_pricing: true },
    });
    expect(pricingOnly.showtimes).toBe("Manage showtimes");
  });

  it("movies requires at least the manager role tier (cinema_movies has no dedicated permission key yet)", () => {
    const managerNoPerms = cinemaDashboardNavLabels({
      role: "manager",
      status: "active",
      permissions: {},
    });
    expect(managerNoPerms.movies).toBe("Manage movies");

    const staffRole = cinemaDashboardNavLabels({ role: "staff", status: "active", permissions: {} });
    expect(staffRole.movies).toBe("Movies");
  });

  it("returns plain wording for every link when membership is null (defensive default)", () => {
    expect(cinemaDashboardNavLabels(null)).toEqual({
      staff: "Staff",
      movies: "Movies",
      screens: "Screens",
      showtimes: "Showtimes",
    });
  });
});

describe("hasMinCinemaStaffRole", () => {
  it("returns false when the membership is not active", () => {
    expect(hasMinCinemaStaffRole({ role: "owner", status: "invited" }, "staff")).toBe(false);
  });

  it("returns false for a null membership", () => {
    expect(hasMinCinemaStaffRole(null, "staff")).toBe(false);
  });

  it("ranks owner > manager > staff", () => {
    expect(hasMinCinemaStaffRole({ role: "owner", status: "active" }, "manager")).toBe(true);
    expect(hasMinCinemaStaffRole({ role: "manager", status: "active" }, "owner")).toBe(false);
    expect(hasMinCinemaStaffRole({ role: "staff", status: "active" }, "staff")).toBe(true);
  });
});
