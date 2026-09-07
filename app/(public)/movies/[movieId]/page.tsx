import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { firstParam, isValidUuid, parseDateParam, utcDayBounds } from "@/lib/catalog/browse-query";

interface MovieDetail {
  id: string;
  title: string;
  description: string | null;
  poster_url: string | null;
  duration_minutes: number;
  rating: string | null;
}

interface CinemaAssociationRow {
  cinemas: { id: string; name: string } | null;
}

interface ShowtimeRow {
  id: string;
  starts_at: string;
  base_price: string;
  currency_code: string;
  cinemas: { id: string; name: string } | null;
  screens: { name: string } | null;
}

export default async function PublicMovieDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ movieId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { movieId } = await params;
  if (!isValidUuid(movieId)) notFound();

  const sp = await searchParams;
  const date = parseDateParam(firstParam(sp.date));

  const supabase = await createServerSupabaseClient();

  // movies_select_public is `using (true)` (the master catalog is
  // world-readable so an admin can be linked to/verified), but a public
  // *detail page* must only exist for a title actually offered somewhere —
  // that's checked below via cinema_movies, not this query.
  const { data: movie } = await supabase
    .from("movies")
    .select("id, title, description, poster_url, duration_minutes, rating")
    .eq("id", movieId)
    .maybeSingle();

  if (!movie) notFound();

  const { data: associationRows } = await supabase
    .from("cinema_movies")
    .select("cinemas:cinema_id(id, name)")
    .eq("movie_id", movieId);

  const cinemas = ((associationRows ?? []) as unknown as CinemaAssociationRow[])
    .map((row) => row.cinemas)
    .filter((c): c is { id: string; name: string } => c !== null);

  // cinema_movies' RLS only returns rows here whose cinema is approved (or
  // the caller is that cinema's own staff/admin — never true for a public
  // visitor). Zero rows means "not offered by any approved cinema" — treat
  // the movie's public page as not found, same as the cinema-detail page's
  // approved-only rule.
  if (cinemas.length === 0) notFound();

  const movieDetail = movie as MovieDetail;

  let showtimeQuery = supabase
    .from("showtimes")
    .select(
      "id, starts_at, base_price, currency_code, cinemas:cinema_id(id, name), screens:screen_id(name)",
    )
    .eq("movie_id", movieId)
    .order("starts_at", { ascending: true })
    .limit(50);

  const bounds = date ? utcDayBounds(date) : null;
  if (bounds) {
    showtimeQuery = showtimeQuery
      .gte("starts_at", bounds.start.toISOString())
      .lt("starts_at", bounds.end.toISOString());
  } else {
    showtimeQuery = showtimeQuery.gte("starts_at", new Date().toISOString());
  }

  const { data: showtimesData } = await showtimeQuery;
  const showtimes = (showtimesData ?? []) as unknown as ShowtimeRow[];

  return (
    <main>
      <h1>{movieDetail.title}</h1>
      <p>
        {movieDetail.duration_minutes} min
        {movieDetail.rating ? ` — ${movieDetail.rating}` : ""}
      </p>
      {movieDetail.description && <p>{movieDetail.description}</p>}

      <section>
        <h2>Showing at</h2>
        <ul>
          {cinemas.map((cinema) => (
            <li key={cinema.id}>
              <Link href={`/cinemas/${cinema.id}`}>{cinema.name}</Link>
            </li>
          ))}
        </ul>
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
        {date && <Link href={`/movies/${movieId}`}>Clear date filter</Link>}

        {showtimes.length === 0 ? (
          <p>{date ? `No showtimes on ${date}.` : "No upcoming showtimes."}</p>
        ) : (
          <ul>
            {showtimes.map((showtime) => (
              <li key={showtime.id}>
                <Link href={`/showtimes/${showtime.id}`}>{showtime.cinemas?.name ?? "Unknown cinema"}</Link>{" "}
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
