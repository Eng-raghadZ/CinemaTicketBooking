import { describe, expect, it } from "vitest";
import {
  MAX_PAGE,
  PAGE_SIZE,
  buildContainsPattern,
  buildPageHref,
  escapeIlikeWildcards,
  firstParam,
  isRangeNotSatisfiableError,
  isShowtimeOngoingOrUpcoming,
  isValidUuid,
  parseDateParam,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  resolvePage,
  totalPages,
  utcDayBounds,
} from "@/lib/catalog/browse-query";

describe("isShowtimeOngoingOrUpcoming", () => {
  const now = new Date("2026-09-10T12:30:00.000Z");

  it("keeps a movie visible while its showtime is still running", () => {
    expect(isShowtimeOngoingOrUpcoming("2026-09-10T12:00:00.000Z", 120, now)).toBe(true);
  });

  it("keeps a future showtime visible", () => {
    expect(isShowtimeOngoingOrUpcoming("2026-09-10T19:00:00.000Z", 90, now)).toBe(true);
  });

  it("removes a movie once the showtime has ended", () => {
    expect(isShowtimeOngoingOrUpcoming("2026-09-10T09:00:00.000Z", 120, now)).toBe(false);
  });

  it("rejects invalid dates and durations", () => {
    expect(isShowtimeOngoingOrUpcoming("invalid", 120, now)).toBe(false);
    expect(isShowtimeOngoingOrUpcoming("2026-09-10T12:00:00.000Z", 0, now)).toBe(false);
  });
});

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

describe("resolvePage (pagination out-of-range handling)", () => {
  it("does not redirect when the requested page is within range", () => {
    // 45 rows at 20/page = 3 pages; page 3 is the last valid page.
    expect(resolvePage(3, 45, 20)).toEqual({ page: 3, pages: 3, needsRedirect: false });
  });

  it("does not redirect for page 1 of a normal result set", () => {
    expect(resolvePage(1, 45, 20)).toEqual({ page: 1, pages: 3, needsRedirect: false });
  });

  it("normalizes a page beyond the real result count to the last page and signals a redirect", () => {
    // 45 rows at 20/page = 3 pages; page 10 does not exist.
    expect(resolvePage(10, 45, 20)).toEqual({ page: 3, pages: 3, needsRedirect: true });
  });

  it("handles an extremely large (but already MAX_PAGE-clamped) requested page against a small dataset", () => {
    expect(resolvePage(MAX_PAGE, 45, 20)).toEqual({ page: 3, pages: 3, needsRedirect: true });
  });

  it("handles an empty dataset: page 1 needs no redirect", () => {
    expect(resolvePage(1, 0)).toEqual({ page: 1, pages: 1, needsRedirect: false });
  });

  it("handles an empty dataset: any page beyond 1 redirects to page 1", () => {
    expect(resolvePage(5, 0)).toEqual({ page: 1, pages: 1, needsRedirect: true });
    expect(resolvePage(MAX_PAGE, 0)).toEqual({ page: 1, pages: 1, needsRedirect: true });
  });

  it("never redirects to a page that itself would need another redirect (single-hop convergence)", () => {
    const first = resolvePage(999, 45, 20);
    expect(first.needsRedirect).toBe(true);
    // Recomputing resolvePage with the SAME totalCount for the page we
    // just redirected to must be stable — this is what guarantees the
    // real page component's redirect can't loop under stable data.
    const second = resolvePage(first.page, 45, 20);
    expect(second.needsRedirect).toBe(false);
    expect(second.page).toBe(first.page);
  });

  it("handles a huge total count without overflow or incorrect clamping", () => {
    const result = resolvePage(1, 10_000_000, PAGE_SIZE);
    expect(result.needsRedirect).toBe(false);
    expect(result.page).toBe(1);
    expect(result.pages).toBe(totalPages(10_000_000, PAGE_SIZE));
  });
});

describe("isRangeNotSatisfiableError (distinguishing out-of-range from genuine failures)", () => {
  it("recognizes PostgREST's PGRST103 code as a range-not-satisfiable error", () => {
    expect(isRangeNotSatisfiableError({ code: "PGRST103", message: "Requested range not satisfiable" })).toBe(
      true,
    );
  });

  it("recognizes a range-not-satisfiable error by message even without the exact code", () => {
    expect(isRangeNotSatisfiableError({ message: "Requested Range Not Satisfiable" })).toBe(true);
  });

  it("does NOT classify a genuine, unrelated database error as range-not-satisfiable", () => {
    expect(isRangeNotSatisfiableError({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isRangeNotSatisfiableError({ code: "42501", message: "permission denied for table cinemas" })).toBe(
      false,
    );
    expect(isRangeNotSatisfiableError({ message: "network error" })).toBe(false);
  });

  it("returns false for null/undefined (no error at all)", () => {
    expect(isRangeNotSatisfiableError(null)).toBe(false);
    expect(isRangeNotSatisfiableError(undefined)).toBe(false);
  });
});

describe("buildPageHref (filter-preserving pagination links)", () => {
  it("builds a bare page link with no filters", () => {
    expect(buildPageHref("/cinemas", { q: undefined }, 1)).toBe("/cinemas?page=1");
  });

  it("preserves a single active filter", () => {
    expect(buildPageHref("/movies", { q: "batman" }, 2)).toBe("/movies?q=batman&page=2");
  });

  it("preserves multiple active filters and omits inactive ones", () => {
    const href = buildPageHref(
      "/showtimes",
      { date: "2026-06-15", cinemaId: "11111111-1111-4111-8111-111111111111", movieId: undefined },
      3,
    );
    expect(href).toBe(
      "/showtimes?date=2026-06-15&cinemaId=11111111-1111-4111-8111-111111111111&page=3",
    );
  });

  it("omits an empty-string filter the same as undefined", () => {
    expect(buildPageHref("/cinemas", { q: "" }, 1)).toBe("/cinemas?page=1");
  });

  it("always places page last regardless of filter insertion order", () => {
    const href = buildPageHref("/showtimes", { movieId: "abc", date: "2026-01-01" }, 5);
    expect(href.endsWith("page=5")).toBe(true);
  });
});
