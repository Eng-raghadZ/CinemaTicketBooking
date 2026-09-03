import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/auth/server";
import {
  firstParam,
  isValidUuid,
  parseDateParam,
  parsePageParam,
  rangeForPage,
  totalPages,
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
  const page = parsePageParam(firstParam(sp.page));
  const [from, to] = rangeForPage(page);

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("showtimes")
    .select(
      "id, starts_at, base_price, currency_code, movies:movie_id(id, title), cinemas:cinema_id(id, name), screens:screen_id(name)",
      { count: "exact" },
    )
    .order("starts_at", { ascending: true })
    .range(from, to);

  const bounds = date ? utcDayBounds(date) : null;
  if (bounds) {
    query = query.gte("starts_at", bounds.start.toISOString()).lt("starts_at", bounds.end.toISOString());
  } else {
    query = query.gte("starts_at", new Date().toISOString());
  }
  if (cinemaId) query = query.eq("cinema_id", cinemaId);
  if (movieId) query = query.eq("movie_id", movieId);

  const { data, count, error } = await query;
  const showtimes = (data ?? []) as unknown as ShowtimeRow[];
  const pages = totalPages(count ?? 0);

  const baseParams: Record<string, string> = {};
  if (date) baseParams.date = date;
  if (cinemaId) baseParams.cinemaId = cinemaId;
  if (movieId) baseParams.movieId = movieId;

  const pageHref = (targetPage: number) => {
    const sp2 = new URLSearchParams(baseParams);
    sp2.set("page", String(targetPage));
    return `/showtimes?${sp2.toString()}`;
  };

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

      {error && <p role="alert">Could not load showtimes right now. Please try again.</p>}

      {!error && showtimes.length === 0 && (
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
