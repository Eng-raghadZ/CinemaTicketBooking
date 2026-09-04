/**
 * Pure, DB-free helpers for Phase 3 (Customer Browsing): search-term
 * sanitization, pagination math, UUID route-param validation, and date-range
 * parsing for filtering showtimes by day. Kept free of any Supabase/Next.js
 * dependency so it's unit-testable and shared across every public browsing
 * page (app/(public)/cinemas, /movies, /showtimes) rather than
 * re-implemented per page — same pattern as lib/catalog/seat-layout.ts and
 * lib/catalog/overlap.ts: pure logic lives here, the actual Supabase query
 * stays in the page/Server Component itself.
 */

export const PAGE_SIZE = 20;
// A hard ceiling on how far a caller can page, so a crafted ?page=999999
// can't force an unbounded/expensive OFFSET scan against Postgres. Generous
// for any realistic Phase 3 dataset.
export const MAX_PAGE = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Extracts a single string value from a Next.js `searchParams` entry, which
 * may be a plain string, an array (a repeated query key), or undefined.
 */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Clamps a raw `?page=` query param to a safe, positive integer within
 * [1, MAX_PAGE]. Missing or invalid input defaults to page 1 rather than
 * erroring the page — a malformed page param should degrade gracefully,
 * not break browsing.
 */
export function parsePageParam(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

/**
 * Trims and length-bounds a free-text `?q=` search query param.
 * Whitespace-only input is treated as "no search" (undefined), not an
 * empty-string filter.
 */
export function parseSearchParam(raw: string | undefined, maxLength = 100): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, maxLength);
}

/**
 * Validates a `YYYY-MM-DD` date query param, including rejecting strings
 * that match the shape but aren't a real calendar date (e.g. 2026-13-40).
 * Returns undefined (no filter) for anything malformed, rather than
 * throwing — an invalid date typed into the URL should silently fall back
 * to "no date filter", not error the page.
 */
export function parseDateParam(raw: string | undefined): string | undefined {
  if (!raw || !DATE_RE.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10) === raw ? raw : undefined;
}

/**
 * Validates a UUID-shaped route param (cinemaId/movieId/showtimeId). Used
 * by the [id] pages to reject a malformed id with notFound() before ever
 * querying the database.
 */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** The [from, to] inclusive row range for Supabase's `.range()`, for a given 1-indexed page. */
export function rangeForPage(page: number, pageSize = PAGE_SIZE): [number, number] {
  const safePage = Math.max(1, Math.min(page, MAX_PAGE));
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;
  return [from, to];
}

/**
 * Total page count for a given total row count, always at least 1 so
 * pagination UI has something sensible to render even for an empty result
 * set.
 */
export function totalPages(totalCount: number, pageSize = PAGE_SIZE): number {
  if (totalCount <= 0) return 1;
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

/**
 * Escapes Postgres ILIKE wildcard characters (`%`, `_`) and the escape
 * character itself (`\`) in a user-supplied search string, so it's matched
 * as a literal substring rather than interpreted as a pattern. Supabase's
 * query builder already parameterizes the value (no SQL-injection risk
 * either way) — without this, a search for "50_50" would also match
 * "50X50", which is a correctness bug, not a security one, but still one
 * worth avoiding.
 */
export function escapeIlikeWildcards(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Builds a `%term%` ILIKE "contains" pattern from a raw, unescaped search string. */
export function buildContainsPattern(input: string): string {
  return `%${escapeIlikeWildcards(input)}%`;
}

/**
 * The [start, end) UTC window for a given `YYYY-MM-DD` date, used to filter
 * showtimes to a single calendar day. `showtimes.starts_at` is stored UTC
 * (0001_core_schema.sql) and there is no per-cinema timezone column in the
 * current schema, so "a day" is interpreted as a UTC calendar day — see
 * docs/phase3-customer-browsing.md for the documented limitation. Returns
 * null for an invalid date string.
 */
export function utcDayBounds(dateStr: string): { start: Date; end: Date } | null {
  const validated = parseDateParam(dateStr);
  if (!validated) return null;
  const start = new Date(`${validated}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export interface PageResolution {
  /** The page to actually query/render — always <= `pages`. */
  page: number;
  /** Total page count for the current filters (always >= 1). */
  pages: number;
  /** True if `requestedPage` didn't exist and was normalized down to `pages`. */
  needsRedirect: boolean;
}

/**
 * Decides, from an already-validated (parsePageParam-clamped) requested
 * page and the ACTUAL total row count for the current filters, whether the
 * requested page exists. If not, it returns the last real page and signals
 * that the caller should canonically redirect there — this is what lets
 * every list page know a page is out of range BEFORE ever sending a
 * `.range()` request for it, since PostgREST rejects an out-of-range range
 * request outright (see isRangeNotSatisfiableError below) rather than
 * quietly returning zero rows.
 *
 * Pure and DB-free: the caller is responsible for running a cheap
 * `count`-only query first (e.g. `.select("id", { count: "exact", head:
 * true })` with the same filters as the real data query) and passing the
 * result in, and for actually performing the redirect.
 */
export function resolvePage(
  requestedPage: number,
  totalCount: number,
  pageSize = PAGE_SIZE,
): PageResolution {
  const pages = totalPages(totalCount, pageSize);
  if (requestedPage > pages) {
    return { page: pages, pages, needsRedirect: true };
  }
  return { page: requestedPage, pages, needsRedirect: false };
}

/**
 * Classifies a Supabase/PostgREST error as "the requested range doesn't
 * exist" (PostgREST's PGRST103, returned as an HTTP 416 when a `.range()`
 * offset is beyond the actual row count) as opposed to a genuine
 * query/service failure.
 *
 * This is deliberately NOT the primary mechanism for handling an
 * out-of-range page — resolvePage()'s count-then-redirect pattern is,
 * because it stops an out-of-range `.range()` request from ever being sent
 * in the first place. This classifier exists only as defense-in-depth for
 * the narrow race where a row is deleted between the count query and the
 * data query, so that rare case still degrades to an empty/normalized
 * result instead of a scary "Could not load" message.
 */
export function isRangeNotSatisfiableError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST103") return true;
  return typeof error.message === "string" && /range.*not satisfiable/i.test(error.message);
}

/**
 * Builds a canonical `?filter=...&page=N` href for a public list page,
 * preserving every active filter. Shared by /cinemas, /movies, and
 * /showtimes so their pagination links and out-of-range redirect targets
 * are built identically — `undefined`/empty filter values are simply
 * omitted rather than serialized as `key=`.
 */
export function buildPageHref(
  basePath: string,
  filters: Record<string, string | undefined>,
  page: number,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) sp.set(key, value);
  }
  sp.set("page", String(page));
  return `${basePath}?${sp.toString()}`;
}
