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

interface MovieSummary {
  id: string;
  title: string;
  duration_minutes: number;
  rating: string | null;
  poster_url: string | null;
}

// Hard cap on how many cinema_movies association rows we scan to build the
// set of "movies offered by an approved cinema" — bounded so this stays a
// single, cheap query rather than an unbounded scan. Generous for any
// realistic Phase 3 dataset; documented as a known scale limitation in
// docs/phase3-customer-browsing.md.
const MAX_ASSOCIATION_ROWS = 5000;

export const metadata = { title: "Browse movies" };

/**
 * Public movie directory. `movies` itself is world-readable at the RLS
 * layer (`movies_select_public: using (true)`) since it's the platform-wide
 * master catalog an admin curates — but the *public browsing* rule is
 * narrower ("only movies currently offered by approved cinemas"), so this
 * page derives the eligible movie-id set from `cinema_movies`, whose own
 * RLS (`cinema_movies_select`) already returns only approved-cinema
 * associations to an anonymous/customer caller. That set, not the master
 * catalog, is what's queried and paginated below.
 *
 * Pagination safety: same count-then-redirect pattern as /cinemas and
 * /showtimes — see lib/catalog/browse-query.ts's `resolvePage()` and
 * docs/phase3-customer-browsing.md's "Pagination correctness" section.
 */
export default async function PublicMoviesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseSearchParam(firstParam(params.q));
  const requestedPage = parsePageParam(firstParam(params.page));
  const pageHref = (targetPage: number) => buildPageHref("/movies", { q }, targetPage);

  const supabase = await createServerSupabaseClient();

  const { data: associationRows, error: associationError } = await supabase
    .from("cinema_movies")
    .select("movie_id")
    .limit(MAX_ASSOCIATION_ROWS);

  const movieIds = [...new Set((associationRows ?? []).map((row) => row.movie_id))];

  if (associationError || movieIds.length === 0) {
    return (
      <main>
        <h1>Movies</h1>
        {associationError ? (
          <p role="alert">Could not load movies right now. Please try again.</p>
        ) : (
          <p>No movies are currently showing at any approved cinema.</p>
        )}
      </main>
    );
  }

  // Step 1: a cheap, row-free count query using the exact same filters as
  // the real data query below (the eligible movie-id set plus the search
  // term), so we know how many pages actually exist BEFORE ever sending a
  // `.range()` request that could be out of bounds.
  let countQuery = supabase
    .from("movies")
    .select("id", { count: "exact", head: true })
    .in("id", movieIds);
  if (q) countQuery = countQuery.ilike("title", buildContainsPattern(q));

  const { count, error: countError } = await countQuery;

  if (countError) {
    return (
      <main>
        <h1>Movies</h1>
        <p role="alert">Could not load movies right now. Please try again.</p>
      </main>
    );
  }

  const { page, pages, needsRedirect } = resolvePage(requestedPage, count ?? 0);

  // Step 2: canonically redirect to the last real page, preserving the
  // search filter, instead of ever sending an out-of-range `.range()`
  // request — see the identical comment on /cinemas for why this can't
  // loop.
  if (needsRedirect) {
    redirect(pageHref(page));
  }

  const [from, to] = rangeForPage(page);
  let query = supabase
    .from("movies")
    .select("id, title, duration_minutes, rating, poster_url")
    .in("id", movieIds)
    .order("title", { ascending: true })
    .range(from, to);
  if (q) query = query.ilike("title", buildContainsPattern(q));

  const { data, error } = await query;

  // `page` is guaranteed in range by Step 1/2 above, so any error here is
  // a genuine failure, not an out-of-range page. isRangeNotSatisfiableError
  // is defense-in-depth only — see the identical comment on /cinemas.
  if (error && !isRangeNotSatisfiableError(error)) {
    return (
      <main>
        <h1>Movies</h1>
        <p role="alert">Could not load movies right now. Please try again.</p>
      </main>
    );
  }

  const movies = (data ?? []) as MovieSummary[];

  return (
    <main>
      <h1>Movies</h1>

      <form method="get">
        <label>
          Search by title
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Movie title" />
        </label>
        <button type="submit">Search</button>
      </form>

      {movies.length === 0 && (
        <p>{q ? `No movies match "${q}".` : "No movies are currently showing."}</p>
      )}

      {movies.length > 0 && (
        <ul>
          {movies.map((movie) => (
            <li key={movie.id}>
              <Link href={`/movies/${movie.id}`}>{movie.title}</Link> — {movie.duration_minutes} min
              {movie.rating ? ` — ${movie.rating}` : ""}
            </li>
          ))}
        </ul>
      )}

      {movies.length > 0 && (
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
