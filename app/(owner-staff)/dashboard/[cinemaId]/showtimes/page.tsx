import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import { hasCinemaPermission, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { ShowtimeForm } from "./showtime-form";
import { ShowtimeRowActions } from "./showtime-row-actions";
import ui from "@/app/ui.module.css";

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
    <main className={ui.container}>
      <Link href={`/dashboard/${cinemaId}`} className={ui.backLink}>
        ← Back to cinema
      </Link>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Showtimes</h1>
      </div>

      <section className={ui.section}>
        <div className={ui.sectionHeader}>
          <h2 className={ui.sectionTitle}>Scheduled showtimes ({showtimes.length})</h2>
        </div>
        {showtimes.length === 0 ? (
          <p className={ui.emptyState}>No showtimes scheduled yet.</p>
        ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
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
          </div>
        )}
      </section>

      <section className={ui.section}>
        {canManageShowtimes ? (
          <>
            <div className={ui.sectionHeader}>
              <h2 className={ui.sectionTitle}>Schedule a new showtime</h2>
            </div>
            {screens.length === 0 ? (
              <p className={ui.emptyState}>Create a screen first before scheduling showtimes.</p>
            ) : cinemaMovies.length === 0 ? (
              <p className={ui.emptyState}>
                Add a movie to this cinema&apos;s catalog first before scheduling showtimes.
              </p>
            ) : (
              <ShowtimeForm
                cinemaId={cinemaId}
                screens={screens}
                movies={cinemaMovies
                  .map((cm) => cm.movies)
                  .filter((m): m is { id: string; title: string; duration_minutes: number } => m !== null)}
              />
            )}
          </>
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Only the cinema owner, or a manager granted the &quot;manage showtimes&quot;
            permission, can schedule showtimes.
          </p>
        )}
      </section>
    </main>
  );
}
