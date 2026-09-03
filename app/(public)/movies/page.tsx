import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/auth/server";
import {
  buildContainsPattern,
  firstParam,
  parsePageParam,
  parseSearchParam,
  rangeForPage,
  totalPages,
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
 * Public movie directory. `movies` itself is world-readable
 * (movies_select_public: `using (true)`) since it's the platform-wide
 * master catalog an admin curates — but the *public browsing* rule is
 * narrower ("only movies currently offered by approved cinemas"), so this
 * page derives the eligible movie-id set from `cinema_movies`, whose own
 * RLS (cinema_movies_select) already returns only approved-cinema
 * associations to an anonymous/customer caller. That set, not the master
 * catalog, is what's queried and paginated below.
 */
export default async function PublicMoviesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = parseSearchParam(firstParam(params.q));
  const page = parsePageParam(firstParam(params.page));
  const [from, to] = rangeForPage(page);

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

  let query = supabase
    .from("movies")
    .select("id, title, duration_minutes, rating, poster_url", { count: "exact" })
    .in("id", movieIds)
    .order("title", { ascending: true })
    .range(from, to);

  if (q) {
    query = query.ilike("title", buildContainsPattern(q));
  }

  const { data, count, error } = await query;
  const movies = (data ?? []) as MovieSummary[];
  const pages = totalPages(count ?? 0);

  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    sp.set("page", String(targetPage));
    return `/movies?${sp.toString()}`;
  };

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

      {error && <p role="alert">Could not load movies right now. Please try again.</p>}

      {!error && movies.length === 0 && (
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
