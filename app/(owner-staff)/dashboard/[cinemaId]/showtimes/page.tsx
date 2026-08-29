import { notFound } from "next/navigation";
import { requireCinemaStaff } from "@/lib/auth/guards";
import { hasMinCinemaStaffRole } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import { ShowtimeForm } from "./showtime-form";
import { ShowtimeRowActions } from "./showtime-row-actions";

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
  const { role } = await requireCinemaStaff(cinemaId);
  const canManage = hasMinCinemaStaffRole({ role, status: "active" }, "manager");

  const supabase = await createServerSupabaseClient();

  const [{ data: showtimesData, error: showtimesError }, { data: screensData }, { data: cinemaMoviesData }] =
    await Promise.all([
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
    ]);

  if (showtimesError) notFound();

  const showtimes = (showtimesData ?? []) as unknown as ShowtimeRow[];
  const screens = (screensData ?? []) as ScreenOption[];
  const cinemaMovies = (cinemaMoviesData ?? []) as unknown as CinemaMovieOption[];

  return (
    <main>
      <h1>Showtimes</h1>
      <SignOutButton />

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
                {canManage && <th aria-label="actions" />}
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
                  {canManage && (
                    <td>
                      <ShowtimeRowActions
                        cinemaId={cinemaId}
                        showtimeId={showtime.id}
                        currentPrice={showtime.base_price}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canManage ? (
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
        <p>Only the cinema owner or a manager can schedule showtimes.</p>
      )}
    </main>
  );
}
