import { describe, expect, it } from "vitest";
import { inviteStaffSchema, staffPermissionsSchema } from "@/lib/validation/staff";

const CINEMA_ID = "00000000-0000-0000-0000-000000000000";

describe("inviteStaffSchema", () => {
  it("accepts a valid manager invite with permissions", () => {
    const result = inviteStaffSchema.safeParse({
      cinemaId: CINEMA_ID,
      email: "Manager@Example.com",
      role: "manager",
      permissions: { manage_staff: true },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // lowercased so an invite lookup by email is case-insensitive-safe
      expect(result.data.email).toBe("manager@example.com");
    }
  });

  it("defaults permissions to an empty object when omitted", () => {
    const result = inviteStaffSchema.safeParse({
      cinemaId: CINEMA_ID,
      email: "staff@example.com",
      role: "staff",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.permissions).toEqual({});
  });

  it("rejects role 'owner' — ownership is only ever granted via cinema creation", () => {
    const result = inviteStaffSchema.safeParse({ cinemaId: CINEMA_ID, email: "x@example.com", role: "owner" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = inviteStaffSchema.safeParse({
      cinemaId: CINEMA_ID,
      email: "not-an-email",
      role: "staff",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid cinemaId", () => {
    const result = inviteStaffSchema.safeParse({
      cinemaId: "not-a-uuid",
      email: "x@example.com",
      role: "staff",
    });
    expect(result.success).toBe(false);
  });
});

describe("staffPermissionsSchema", () => {
  it("accepts a subset of the fixed permission keys", () => {
    const result = staffPermissionsSchema.safeParse({ manage_showtimes: true, view_bookings: false });
    expect(result.success).toBe(true);
  });

  it("rejects unknown permission keys (fixed vocabulary — architecture Section 10 risk mitigation)", () => {
    const result = staffPermissionsSchema.safeParse({ delete_everything: true });
    expect(result.success).toBe(false);
  });
});
