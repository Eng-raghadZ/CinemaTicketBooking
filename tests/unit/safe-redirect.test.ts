import { describe, expect, it } from "vitest";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";

describe("safeInternalRedirectPath", () => {
  it("allows an internal path", () => {
    expect(safeInternalRedirectPath("/dashboard")).toBe("/dashboard");
  });

  it("preserves query parameters and hashes", () => {
    expect(
      safeInternalRedirectPath("/dashboard/cinemas?status=approved#results"),
    ).toBe("/dashboard/cinemas?status=approved#results");
  });

  it.each([
    undefined,
    null,
    "",
    "dashboard",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "\\example.com",
  ])("falls back for unsafe redirect value: %s", (value) => {
    expect(safeInternalRedirectPath(value)).toBe("/dashboard");
  });

  it("supports a custom fallback", () => {
    expect(safeInternalRedirectPath("//example.com", "/login")).toBe("/login");
  });
});
