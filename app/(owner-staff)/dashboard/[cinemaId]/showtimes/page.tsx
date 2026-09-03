import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import { hasCinemaPermission, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { ShowtimeForm } from "./showtime-form";
import { ShowtimeRowActions } from "./showtime-row-actions";
import { BackLink } from "@/components/back-link";

interface ShowtimeRow {
  id: string;
  starts_at: string;
  base_price: string;
  currency_code: string;
  movies: { title: string; duration_minutes: number } | null;
  screens: { name: string } | null;
}

interface ScreenOption {
  id: string;
  name: string;
}

interface CinemaMovieOption {
  movie_id: string;
  movies: { id: string; title: string; duration_minutes: number } | null;
}

export default async function CinemaShowtimesPage({
  params,
}: {
  params: Promise<{ cinemaId: string }>;
}) {
  const { cinemaId } = await params;
  const { userId } = await requireCinemaStaffOrRedirect(cinemaId);

  const supabase = await createServerSupabaseClient();

  const [
    { data: showtimesData, error: showtimesError },
    { data: screensData },
    { data: cinemaMoviesData },
    { data: membership },
  ] = await Promise.all([
    supabase
      .from("showtimes")
      .select("id, starts_at, base_price, currency_code, movies:movie_id(title, duration_minutes), screens:screen_id(name)")
      .eq("cinema_id", cinemaId)
      .order("starts_at", { ascending: true }),
    supabase.from("screens").select("id, name").eq("cinema_id", cinemaId).order("name"),
    supabase
      .from("cinema_movies")
      .select("movie_id, movies:movie_id(id, title, duration_minutes)")
      .eq("cinema_id", cinemaId),
    supabase
      .from("cinema_staff")
      .select("role, status, permissions")
      .eq("cinema_id", cinemaId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (showtimesError) notFound();

  const showtimes = (showtimesData ?? []) as unknown as ShowtimeRow[];
  const screens = (screensData ?? []) as ScreenOption[];
  const cinemaMovies = (cinemaMoviesData ?? []) as unknown as CinemaMovieOption[];
  const typedMembership = membership as CinemaStaffMembership | null;
  // Two separate permissions, matching
  // supabase/migrations/0013_catalog_permission_enforcement.sql exactly:
  // scheduling (create/delete) requires manage_showtimes, price edits
  // require manage_pricing. Neither implies the other, so both flags are
  // computed independently and passed down separately.
  const canManageShowtimes = hasCinemaPermission(typedMembership, "manage_showtimes");
  const canManagePricing = hasCinemaPermission(typedMembership, "manage_pricing");
  const canManageAny = canManageShowtimes || canManagePricing;

  return (
    <main>
      <BackLink href={`/dashboard/${cinemaId}`} label="Cinema dashboard" />
      <h1>Showtimes</h1>

      <section>
        <h2>Scheduled showtimes ({showtimes.length})</h2>
        {showtimes.length === 0 ? (
          <p>No showtimes scheduled yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Movie</th>
                <th>Screen</th>
                <th>Starts</th>
                <th>Price</th>
                {canManageAny && <th aria-label="actions" />}
              </tr>
            </thead>
            <tbody>
              {showtimes.map((showtime) => (
                <tr key={showtime.id}>
                  <td>
                    {showtime.movies?.title ?? "—"} ({showtime.movies?.duration_minutes ?? "?"} min)
                  </td>
                  <td>{showtime.screens?.name ?? "—"}</td>
                  <td>{new Date(showtime.starts_at).toLocaleString()}</td>
                  <td>
                    {showtime.base_price} {showtime.currency_code}
                  </td>
                  {canManageAny && (
                    <td>
                      <ShowtimeRowActions
                        cinemaId={cinemaId}
                        showtimeId={showtime.id}
                        currentPrice={showtime.base_price}
                        canManageShowtimes={canManageShowtimes}
                        canManagePricing={canManagePricing}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canManageShowtimes ? (
        <section>
          <h2>Schedule a new showtime</h2>
          {screens.length === 0 ? (
            <p>Create a screen first before scheduling showtimes.</p>
          ) : cinemaMovies.length === 0 ? (
            <p>Add a movie to this cinema&apos;s catalog first before scheduling showtimes.</p>
          ) : (
            <ShowtimeForm
              cinemaId={cinemaId}
              screens={screens}
              movies={cinemaMovies
                .map((cm) => cm.movies)
                .filter((m): m is { id: string; title: string; duration_minutes: number } => m !== null)}
            />
          )}
        </section>
      ) : (
        <p>
          Only the cinema owner, or a manager granted the &quot;manage showtimes&quot;
          permission, can schedule showtimes.
        </p>
      )}
    </main>
  );
}
