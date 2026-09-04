import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
import {
  buildPageHref,
  firstParam,
  isRangeNotSatisfiableError,
  isValidUuid,
  parseDateParam,
  parsePageParam,
  rangeForPage,
  resolvePage,
  utcDayBounds,
} from "@/lib/catalog/browse-query";

interface ShowtimeRow {
  id: string;
  starts_at: string;
  base_price: string;
  currency_code: string;
  movies: { id: string; title: string } | null;
  cinemas: { id: string; name: string } | null;
  screens: { name: string } | null;
}

export const metadata = { title: "Upcoming showtimes" };

/**
 * Cross-cinema upcoming-showtimes browsing. `showtimes_select` RLS
 * (0005_rls_policies.sql) already scopes every row returned here to a
 * showtime whose cinema is approved — a public visitor never sees a
 * showtime belonging to a pending/rejected/suspended cinema, enforced at
 * the database layer.
 *
 * Pagination safety: same count-then-redirect pattern as /cinemas and
 * /movies — see lib/catalog/browse-query.ts's `resolvePage()` and
 * docs/phase3-customer-browsing.md's "Pagination correctness" section.
 */
export default async function PublicShowtimesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const date = parseDateParam(firstParam(sp.date));
  const rawCinemaId = firstParam(sp.cinemaId);
  const cinemaId = rawCinemaId && isValidUuid(rawCinemaId) ? rawCinemaId : undefined;
  const rawMovieId = firstParam(sp.movieId);
  const movieId = rawMovieId && isValidUuid(rawMovieId) ? rawMovieId : undefined;
  const requestedPage = parsePageParam(firstParam(sp.page));

  const pageHref = (targetPage: number) =>
    buildPageHref("/showtimes", { date, cinemaId, movieId }, targetPage);

  const supabase = await createServerSupabaseClient();
  const bounds = date ? utcDayBounds(date) : null;

  // Step 1: a cheap, row-free count query using the exact same filters as
  // the real data query below, so we know how many pages actually exist
  // BEFORE ever sending a `.range()` request that could be out of bounds.
  let countQuery = supabase.from("showtimes").select("id", { count: "exact", head: true });
  if (bounds) {
    countQuery = countQuery.gte("starts_at", bounds.start.toISOString()).lt("starts_at", bounds.end.toISOString());
  } else {
    countQuery = countQuery.gte("starts_at", new Date().toISOString());
  }
  if (cinemaId) countQuery = countQuery.eq("cinema_id", cinemaId);
  if (movieId) countQuery = countQuery.eq("movie_id", movieId);

  const { count, error: countError } = await countQuery;

  if (countError) {
    return (
      <main>
        <h1>Upcoming showtimes</h1>
        <p role="alert">Could not load showtimes right now. Please try again.</p>
      </main>
    );
  }

  const { page, pages, needsRedirect } = resolvePage(requestedPage, count ?? 0);

  // Step 2: canonically redirect to the last real page, preserving every
  // active filter, instead of ever sending an out-of-range `.range()`
  // request — see the identical comment on /cinemas for why this can't
  // loop.
  if (needsRedirect) {
    redirect(pageHref(page));
  }

  const [from, to] = rangeForPage(page);
  let query = supabase
    .from("showtimes")
    .select(
      "id, starts_at, base_price, currency_code, movies:movie_id(id, title), cinemas:cinema_id(id, name), screens:screen_id(name)",
    )
    .order("starts_at", { ascending: true })
    .range(from, to);
  if (bounds) {
    query = query.gte("starts_at", bounds.start.toISOString()).lt("starts_at", bounds.end.toISOString());
  } else {
    query = query.gte("starts_at", new Date().toISOString());
  }
  if (cinemaId) query = query.eq("cinema_id", cinemaId);
  if (movieId) query = query.eq("movie_id", movieId);

  const { data, error } = await query;

  // `page` is guaranteed in range by Step 1/2 above, so any error here is
  // a genuine failure, not an out-of-range page. isRangeNotSatisfiableError
  // is defense-in-depth only — see the identical comment on /cinemas.
  if (error && !isRangeNotSatisfiableError(error)) {
    return (
      <main>
        <h1>Upcoming showtimes</h1>
        <p role="alert">Could not load showtimes right now. Please try again.</p>
      </main>
    );
  }

  const showtimes = (data ?? []) as unknown as ShowtimeRow[];

  return (
    <main>
      <h1>Upcoming showtimes</h1>

      <form method="get">
        <label>
          Date
          <input type="date" name="date" defaultValue={date ?? ""} />
        </label>
        <button type="submit">Filter</button>
      </form>
      {(date || cinemaId || movieId) && <Link href="/showtimes">Clear all filters</Link>}

      {showtimes.length === 0 && (
        <p>{date ? `No showtimes on ${date}.` : "No upcoming showtimes."}</p>
      )}

      {showtimes.length > 0 && (
        <ul>
          {showtimes.map((showtime) => (
            <li key={showtime.id}>
              <Link href={`/showtimes/${showtime.id}`}>{showtime.movies?.title ?? "Unknown movie"}</Link> at{" "}
              {showtime.cinemas ? (
                <Link href={`/cinemas/${showtime.cinemas.id}`}>{showtime.cinemas.name}</Link>
              ) : (
                "Unknown cinema"
              )}{" "}
              — {showtime.screens?.name ?? "Screen"} — {new Date(showtime.starts_at).toLocaleString()} —{" "}
              {showtime.base_price} {showtime.currency_code}
            </li>
          ))}
        </ul>
      )}

      {showtimes.length > 0 && (
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
