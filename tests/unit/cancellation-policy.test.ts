import { describe, expect, it } from "vitest";
import {
  evaluateCancellationEligibility,
  isPolicyWithinPlatformLimits,
} from "@/lib/policy/cancellation";

describe("evaluateCancellationEligibility", () => {
  const policy = { cancellationWindowHours: 24, refundPercentage: 80 };

  it("is eligible when well outside the cancellation window", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const showtimeStartsAt = new Date("2026-01-05T00:00:00Z");
    const result = evaluateCancellationEligibility({ now, showtimeStartsAt, policy });
    expect(result).toEqual({ eligible: true, refundPercentage: 80 });
  });

  it("is NOT eligible exactly at the boundary minus a minute", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const showtimeStartsAt = new Date("2026-01-01T23:59:00Z"); // 23h59m away
    const result = evaluateCancellationEligibility({ now, showtimeStartsAt, policy });
    expect(result.eligible).toBe(false);
    expect(result.refundPercentage).toBe(0);
  });

  it("is eligible exactly at the boundary", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const showtimeStartsAt = new Date("2026-01-02T00:00:00Z"); // exactly 24h
    const result = evaluateCancellationEligibility({ now, showtimeStartsAt, policy });
    expect(result.eligible).toBe(true);
  });

  it("is NOT eligible once the showtime has already passed", () => {
    const now = new Date("2026-01-05T00:00:00Z");
    const showtimeStartsAt = new Date("2026-01-01T00:00:00Z");
    const result = evaluateCancellationEligibility({ now, showtimeStartsAt, policy });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/already passed/);
  });
});

describe("isPolicyWithinPlatformLimits", () => {
  const limits = { minCancellationWindowHours: 2, maxRefundPercentage: 90 };

  it("accepts a policy within bounds", () => {
    const result = isPolicyWithinPlatformLimits({
      policy: { cancellationWindowHours: 24, refundPercentage: 80 },
      limits,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a cancellation window shorter than the platform minimum", () => {
    const result = isPolicyWithinPlatformLimits({
      policy: { cancellationWindowHours: 1, refundPercentage: 50 },
      limits,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/below the platform minimum/);
  });

  it("rejects a refund percentage above the platform maximum", () => {
    const result = isPolicyWithinPlatformLimits({
      policy: { cancellationWindowHours: 24, refundPercentage: 100 },
      limits,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceeds the platform maximum/);
  });

  it("accepts exactly at both boundaries", () => {
    const result = isPolicyWithinPlatformLimits({
      policy: { cancellationWindowHours: 2, refundPercentage: 90 },
      limits,
    });
    expect(result.valid).toBe(true);
  });
});
