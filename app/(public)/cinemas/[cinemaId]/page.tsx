import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { firstParam, isValidUuid, parseDateParam, utcDayBounds } from "@/lib/catalog/browse-query";

interface CinemaDetail {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  country_code: string;
  currency_code: string;
}

interface CinemaMovieRow {
  movie_id: string;
  movies: { id: string; title: string; duration_minutes: number; rating: string | null } | null;
}

interface ShowtimeRow {
  id: string;
  starts_at: string;
  base_price: string;
  currency_code: string;
  movies: { id: string; title: string } | null;
  screens: { name: string } | null;
}

export default async function PublicCinemaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ cinemaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { cinemaId } = await params;
  if (!isValidUuid(cinemaId)) notFound();

  const sp = await searchParams;
  const date = parseDateParam(firstParam(sp.date));

  const supabase = await createServerSupabaseClient();

  const { data: cinema } = await supabase
    .from("cinemas")
    .select("id, name, description, location, country_code, currency_code")
    .eq("id", cinemaId)
    .eq("status", "approved")
    .maybeSingle();

  // "Doesn't exist" and "exists but isn't approved yet" render the exact
  // same generic 404 — a public visitor must never be able to tell the two
  // apart (Phase 3 data-visibility requirement: never expose
  // draft/pending/rejected/suspended cinemas, not even their existence).
  if (!cinema) notFound();
  const cinemaDetail = cinema as CinemaDetail;

  const { data: cinemaMoviesData } = await supabase
    .from("cinema_movies")
    .select("movie_id, movies:movie_id(id, title, duration_minutes, rating)")
    .eq("cinema_id", cinemaId)
    .order("created_at", { ascending: true });
  const cinemaMovies = (cinemaMoviesData ?? []) as unknown as CinemaMovieRow[];

  let showtimeQuery = supabase
    .from("showtimes")
    .select(
      "id, starts_at, base_price, currency_code, movies:movie_id(id, title), screens:screen_id(name)",
    )
    .eq("cinema_id", cinemaId)
    .order("starts_at", { ascending: true })
    .limit(50);

  const bounds = date ? utcDayBounds(date) : null;
  if (bounds) {
    showtimeQuery = showtimeQuery
      .gte("starts_at", bounds.start.toISOString())
      .lt("starts_at", bounds.end.toISOString());
  } else {
    // No date filter: "upcoming" only, never past showtimes.
    showtimeQuery = showtimeQuery.gte("starts_at", new Date().toISOString());
  }

  const { data: showtimesData } = await showtimeQuery;
  const showtimes = (showtimesData ?? []) as unknown as ShowtimeRow[];

  return (
    <main>
      <h1>{cinemaDetail.name}</h1>
      <p>
        {cinemaDetail.location ?? "Location not provided"} — {cinemaDetail.country_code}
      </p>
      {cinemaDetail.description && <p>{cinemaDetail.description}</p>}

      <section>
        <h2>Now showing</h2>
        {cinemaMovies.length === 0 ? (
          <p>This cinema hasn&apos;t added any movies yet.</p>
        ) : (
          <ul>
            {cinemaMovies.map((cm) => (
              <li key={cm.movie_id}>
                {cm.movies ? (
                  <Link href={`/movies/${cm.movies.id}`}>{cm.movies.title}</Link>
                ) : (
                  "Unavailable"
                )}
                {cm.movies?.duration_minutes ? ` — ${cm.movies.duration_minutes} min` : ""}
                {cm.movies?.rating ? ` — ${cm.movies.rating}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Upcoming showtimes</h2>
        <form method="get">
          <label>
            Date
            <input type="date" name="date" defaultValue={date ?? ""} />
          </label>
          <button type="submit">Filter</button>
        </form>
        {date && <Link href={`/cinemas/${cinemaId}`}>Clear date filter</Link>}

        {showtimes.length === 0 ? (
          <p>{date ? `No showtimes on ${date}.` : "No upcoming showtimes."}</p>
        ) : (
          <ul>
            {showtimes.map((showtime) => (
              <li key={showtime.id}>
                <Link href={`/showtimes/${showtime.id}`}>{showtime.movies?.title ?? "Unknown movie"}</Link>{" "}
                — {showtime.screens?.name ?? "Screen"} — {new Date(showtime.starts_at).toLocaleString()} —{" "}
                {showtime.base_price} {showtime.currency_code}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
