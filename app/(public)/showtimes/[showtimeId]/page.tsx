import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { isValidUuid } from "@/lib/catalog/browse-query";

interface ShowtimeDetail {
  id: string;
  starts_at: string;
  base_price: string;
  currency_code: string;
  movies: { id: string; title: string; duration_minutes: number } | null;
  cinemas: { id: string; name: string; location: string | null } | null;
  screens: { name: string } | null;
}

export default async function PublicShowtimeDetailPage({
  params,
}: {
  params: Promise<{ showtimeId: string }>;
}) {
  const { showtimeId } = await params;
  if (!isValidUuid(showtimeId)) notFound();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("showtimes")
    .select(
      "id, starts_at, base_price, currency_code, movies:movie_id(id, title, duration_minutes), cinemas:cinema_id(id, name, location), screens:screen_id(name)",
    )
    .eq("id", showtimeId)
    .maybeSingle();

  // showtimes_select RLS only returns this row to an anonymous caller when
  // its cinema is approved — "not found" here already covers both "no such
  // showtime" and "showtime belongs to a non-approved cinema", with no way
  // to tell the two apart from outside, matching the same rule used on the
  // cinema/movie detail pages.
  if (!data) notFound();
  const showtime = data as unknown as ShowtimeDetail;

  const isPast = new Date(showtime.starts_at).getTime() < Date.now();

  return (
    <main>
      <h1>{showtime.movies?.title ?? "Showtime"}</h1>
      <dl>
        <dt>Cinema</dt>
        <dd>
          {showtime.cinemas ? (
            <Link href={`/cinemas/${showtime.cinemas.id}`}>{showtime.cinemas.name}</Link>
          ) : (
            "Unknown"
          )}
          {showtime.cinemas?.location ? ` — ${showtime.cinemas.location}` : ""}
        </dd>
        <dt>Screen</dt>
        <dd>{showtime.screens?.name ?? "—"}</dd>
        <dt>Starts</dt>
        <dd>{new Date(showtime.starts_at).toLocaleString()}</dd>
        <dt>Runtime</dt>
        <dd>{showtime.movies?.duration_minutes ? `${showtime.movies.duration_minutes} min` : "—"}</dd>
        <dt>Price</dt>
        <dd>
          {showtime.base_price} {showtime.currency_code}
        </dd>
      </dl>

      {isPast ? (
        <p>This showtime has already started or ended.</p>
      ) : (
        // Seat selection and booking are Phase 4 work — this links to a
        // clearly-labeled placeholder, not a partially-built booking flow.
        <p>
          <Link href={`/booking-unavailable?showtimeId=${showtime.id}`}>Select seats</Link>
        </p>
      )}

      {showtime.movies && (
        <p>
          <Link href={`/movies/${showtime.movies.id}`}>More about this movie</Link>
        </p>
      )}
    </main>
  );
}
