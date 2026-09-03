import { describe, expect, it } from "vitest";
import {
  MAX_PAGE,
  PAGE_SIZE,
  buildContainsPattern,
  escapeIlikeWildcards,
  firstParam,
  isValidUuid,
  parseDateParam,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  totalPages,
  utcDayBounds,
} from "@/lib/catalog/browse-query";

describe("firstParam", () => {
  it("returns the value unchanged for a plain string", () => {
    expect(firstParam("abc")).toBe("abc");
  });

  it("returns the first element for a repeated-key array", () => {
    expect(firstParam(["a", "b"])).toBe("a");
  });

  it("returns undefined for undefined", () => {
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("parsePageParam", () => {
  it("defaults to 1 for missing input", () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("defaults to 1 for non-numeric input", () => {
    expect(parsePageParam("abc")).toBe(1);
  });

  it("defaults to 1 for zero or negative input", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-5")).toBe(1);
  });

  it("defaults to 1 for a non-integer input", () => {
    expect(parsePageParam("2.5")).toBe(1);
  });

  it("accepts a valid positive integer", () => {
    expect(parsePageParam("3")).toBe(3);
  });

  it("clamps to MAX_PAGE for an excessively large input", () => {
    expect(parsePageParam("999999")).toBe(MAX_PAGE);
  });
});

describe("parseSearchParam", () => {
  it("returns undefined for missing input", () => {
    expect(parseSearchParam(undefined)).toBeUndefined();
  });

  it("returns undefined for whitespace-only input", () => {
    expect(parseSearchParam("   ")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(parseSearchParam("  hello  ")).toBe("hello");
  });

  it("truncates to the given max length", () => {
    const long = "a".repeat(200);
    expect(parseSearchParam(long, 10)).toBe("a".repeat(10));
  });
});

describe("parseDateParam", () => {
  it("accepts a well-formed date", () => {
    expect(parseDateParam("2026-06-15")).toBe("2026-06-15");
  });

  it("rejects a malformed date string", () => {
    expect(parseDateParam("06-15-2026")).toBeUndefined();
    expect(parseDateParam("not-a-date")).toBeUndefined();
  });

  it("rejects a calendar-invalid date that matches the shape", () => {
    expect(parseDateParam("2026-13-40")).toBeUndefined();
  });

  it("returns undefined for missing input", () => {
    expect(parseDateParam(undefined)).toBeUndefined();
  });
});

describe("isValidUuid", () => {
  it("accepts a well-formed v4 uuid", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
  });

  it("rejects a non-uuid string", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    expect(isValidUuid("")).toBe(false);
  });

  it("rejects a uuid-shaped string with an invalid version nibble", () => {
    expect(isValidUuid("123e4567-e89b-92d3-a456-426614174000")).toBe(false);
  });
});

describe("rangeForPage", () => {
  it("computes the first page range using the default page size", () => {
    expect(rangeForPage(1)).toEqual([0, PAGE_SIZE - 1]);
  });

  it("computes a later page range with a custom page size", () => {
    expect(rangeForPage(3, 10)).toEqual([20, 29]);
  });

  it("clamps a below-range page to 1", () => {
    expect(rangeForPage(0)).toEqual([0, PAGE_SIZE - 1]);
  });

  it("clamps an above-range page to MAX_PAGE", () => {
    const [from] = rangeForPage(MAX_PAGE + 1000, 10);
    expect(from).toBe((MAX_PAGE - 1) * 10);
  });
});

describe("totalPages", () => {
  it("returns 1 for zero or negative counts", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(-5)).toBe(1);
  });

  it("rounds up partial pages", () => {
    expect(totalPages(21, 20)).toBe(2);
    expect(totalPages(20, 20)).toBe(1);
  });
});

describe("escapeIlikeWildcards", () => {
  it("escapes percent and underscore", () => {
    expect(escapeIlikeWildcards("50_50%")).toBe("50\\_50\\%");
  });

  it("escapes a literal backslash", () => {
    expect(escapeIlikeWildcards("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeIlikeWildcards("Riverside Cinema")).toBe("Riverside Cinema");
  });
});

describe("buildContainsPattern", () => {
  it("wraps the escaped term in wildcards", () => {
    expect(buildContainsPattern("river")).toBe("%river%");
  });

  it("escapes wildcard characters before wrapping", () => {
    expect(buildContainsPattern("50%")).toBe("%50\\%%");
  });
});

describe("utcDayBounds", () => {
  it("returns a 24h UTC window for a valid date", () => {
    const bounds = utcDayBounds("2026-06-15");
    expect(bounds).not.toBeNull();
    expect(bounds!.start.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(bounds!.end.toISOString()).toBe("2026-06-16T00:00:00.000Z");
  });

  it("returns null for an invalid date", () => {
    expect(utcDayBounds("not-a-date")).toBeNull();
  });
});
