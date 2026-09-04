import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
import {
  buildContainsPattern,
  buildPageHref,
  firstParam,
  isRangeNotSatisfiableError,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  resolvePage,
} from "@/lib/catalog/browse-query";

interface CinemaSummary {
  id: string;
  name: string;
  location: string | null;
  country_code: string;
  currency_code: string;
}

export const metadata = { title: "Browse cinemas" };

/**
 * Public cinema directory. Relies on `cinemas_select_public_approved`
 * (supabase/migrations/0005_rls_policies.sql) as the actual security
 * boundary — the explicit `.eq("status", "approved")` below is
 * belt-and-suspenders, matching the layered-defense pattern documented in
 * docs/security.md, not the thing actually doing the hiding.
 *
 * Pagination safety: a `?page=` beyond the real number of pages is
 * resolved by running a cheap count-only query FIRST, then canonically
 * redirecting to the last real page if the requested one doesn't exist —
 * this pattern is shared identically across /cinemas, /movies, and
 * /showtimes. See lib/catalog/browse-query.ts's `resolvePage()` and
 * docs/phase3-customer-browsing.md's "Pagination correctness" section for
 * the full reasoning: PostgREST rejects an out-of-range `.range()` request
 * outright (PGRST103), which must not be treated as a generic query
 * failure.
 */
export default async function PublicCinemasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseSearchParam(firstParam(params.q));
  const requestedPage = parsePageParam(firstParam(params.page));
  const pageHref = (targetPage: number) => buildPageHref("/cinemas", { q }, targetPage);

  const supabase = await createServerSupabaseClient();

  // Step 1: a cheap, row-free count query using the exact same filters as
  // the real data query below, so we know how many pages actually exist
  // BEFORE ever sending a `.range()` request that could be out of bounds.
  let countQuery = supabase
    .from("cinemas")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved");
  if (q) countQuery = countQuery.ilike("name", buildContainsPattern(q));

  const { count, error: countError } = await countQuery;

  if (countError) {
    return (
      <main>
        <h1>Cinemas</h1>
        <p role="alert">Could not load cinemas right now. Please try again.</p>
      </main>
    );
  }

  const { page, pages, needsRedirect } = resolvePage(requestedPage, count ?? 0);

  // Step 2: the requested page doesn't exist — canonically redirect to the
  // last real page, preserving the search filter, instead of ever sending
  // an out-of-range `.range()` request. `page` is always <= `pages` here,
  // so the redirect target is itself always in range: the next request's
  // requestedPage (== pages) will match resolvePage's own recomputation of
  // `pages` for the same filters, so this cannot loop.
  if (needsRedirect) {
    redirect(pageHref(page));
  }

  const [from, to] = rangeForPage(page);
  let query = supabase
    .from("cinemas")
    .select("id, name, location, country_code, currency_code")
    .eq("status", "approved")
    .order("name", { ascending: true })
    .range(from, to);
  if (q) query = query.ilike("name", buildContainsPattern(q));

  const { data, error } = await query;

  // `page` is guaranteed in range by Step 1/2 above, so any error here is
  // a genuine failure (network/RLS/etc.), not an out-of-range page.
  // isRangeNotSatisfiableError is defense-in-depth only, for the rare race
  // where a row is deleted between the count query and this one — it is
  // deliberately not the primary mechanism.
  if (error && !isRangeNotSatisfiableError(error)) {
    return (
      <main>
        <h1>Cinemas</h1>
        <p role="alert">Could not load cinemas right now. Please try again.</p>
      </main>
    );
  }

  const cinemas = (data ?? []) as CinemaSummary[];

  return (
    <main>
      <h1>Cinemas</h1>

      <form method="get">
        <label>
          Search by name
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="e.g. Riverside" />
        </label>
        <button type="submit">Search</button>
      </form>

      {cinemas.length === 0 && (
        <p>
          {q ? `No approved cinemas match "${q}".` : "No approved cinemas are available yet."}
        </p>
      )}

      {cinemas.length > 0 && (
        <ul>
          {cinemas.map((cinema) => (
            <li key={cinema.id}>
              <Link href={`/cinemas/${cinema.id}`}>{cinema.name}</Link>
              {cinema.location ? ` — ${cinema.location}` : ""} ({cinema.country_code})
            </li>
          ))}
        </ul>
      )}

      {cinemas.length > 0 && (
        <nav aria-label="Pagination">
          {page > 1 && <Link href={pageHref(page - 1)}>Previous</Link>}{" "}
          <span>
            Page {page} of {pages}
          </span>{" "}
          {page < pages && <Link href={pageHref(page + 1)}>Next</Link>}
        </nav>
      )}
    </main>
  );
}
