import { describe, expect, it } from "vitest";
import { registerCinemaSchema, rejectCinemaSchema, cinemaIdSchema } from "@/lib/validation/cinema";

describe("registerCinemaSchema", () => {
  it("accepts a minimal valid payload and normalizes casing", () => {
    const result = registerCinemaSchema.safeParse({
      name: "Riverside Cinema",
      countryCode: "us",
      currencyCode: "usd",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countryCode).toBe("US");
      expect(result.data.currencyCode).toBe("USD");
      expect(result.data.description).toBeUndefined();
    }
  });

  it("rejects a name that is too short", () => {
    const result = registerCinemaSchema.safeParse({ name: "R", countryCode: "US", currencyCode: "USD" });
    expect(result.success).toBe(false);
  });

  it("rejects a country code that isn't exactly 2 letters", () => {
    const result = registerCinemaSchema.safeParse({
      name: "Riverside",
      countryCode: "USA",
      currencyCode: "USD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a currency code that isn't exactly 3 letters", () => {
    const result = registerCinemaSchema.safeParse({
      name: "Riverside",
      countryCode: "US",
      currencyCode: "US",
    });
    expect(result.success).toBe(false);
  });

  it("treats an empty optional field as undefined rather than an empty string", () => {
    const result = registerCinemaSchema.safeParse({
      name: "Riverside",
      countryCode: "US",
      currencyCode: "USD",
      description: "",
      location: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBeUndefined();
      expect(result.data.location).toBeUndefined();
    }
  });
});

describe("rejectCinemaSchema", () => {
  it("requires a reason of at least 10 characters", () => {
    const result = rejectCinemaSchema.safeParse({
      cinemaId: "00000000-0000-0000-0000-000000000000",
      rejectionReason: "too short",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a sufficiently detailed reason", () => {
    const result = rejectCinemaSchema.safeParse({
      cinemaId: "00000000-0000-0000-0000-000000000000",
      rejectionReason: "Missing required business license documentation.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid cinemaId", () => {
    const result = cinemaIdSchema.safeParse({ cinemaId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});
