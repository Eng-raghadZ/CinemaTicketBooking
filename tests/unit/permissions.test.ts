import { describe, expect, it } from "vitest";
import { canManageCinemaStaff, hasMinCinemaStaffRole } from "@/lib/auth/permissions";

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
