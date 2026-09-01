import { describe, expect, it } from "vitest";
import {
  ForbiddenError,
  UnauthorizedError,
  resolveAuthErrorRedirectPath,
  LOGIN_REDIRECT_PATH,
  ACCESS_DENIED_REDIRECT_PATH,
} from "@/lib/auth/guards";

describe("resolveAuthErrorRedirectPath", () => {
  it("maps UnauthorizedError to the login path", () => {
    expect(resolveAuthErrorRedirectPath(new UnauthorizedError())).toBe(LOGIN_REDIRECT_PATH);
  });

  it("maps ForbiddenError to the access-denied path", () => {
    expect(resolveAuthErrorRedirectPath(new ForbiddenError())).toBe(ACCESS_DENIED_REDIRECT_PATH);
  });

  it("maps a ForbiddenError with a custom message the same way (message content is irrelevant to routing)", () => {
    expect(resolveAuthErrorRedirectPath(new ForbiddenError("custom message"))).toBe(
      ACCESS_DENIED_REDIRECT_PATH,
    );
  });

  it("returns null for an unrelated error, so the caller rethrows it instead of silently redirecting", () => {
    expect(resolveAuthErrorRedirectPath(new Error("some other failure"))).toBeNull();
  });

  it("returns null for a non-Error thrown value", () => {
    expect(resolveAuthErrorRedirectPath("a string was thrown")).toBeNull();
    expect(resolveAuthErrorRedirectPath(undefined)).toBeNull();
    expect(resolveAuthErrorRedirectPath(null)).toBeNull();
  });
});
