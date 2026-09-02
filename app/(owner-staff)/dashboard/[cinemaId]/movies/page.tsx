import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import { hasMinCinemaStaffRole } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { AddMovieForm } from "./add-movie-form";
import { RemoveMovieButton } from "./remove-movie-button";

interface CatalogMovieRow {
  id: string;
  title: string;
  duration_minutes: number;
  rating: string | null;
}

interface CinemaMovieRow {
  movie_id: string;
  movies: { id: string; title: string; duration_minutes: number; rating: string | null } | null;
}

export default async function CinemaMoviesPage({
  params,
}: {
  params: Promise<{ cinemaId: string }>;
}) {
  const { cinemaId } = await params;
  const { role } = await requireCinemaStaffOrRedirect(cinemaId);
  // Matches the RLS policy exactly: cinema_movies_write and
  // showtimes_write both check cinema_staff_role_for(...) IN
  // ('owner','manager') — a plain role-tier check, not the granular
  // `manage_showtimes`/`manage_pricing` permission keys. Those keys exist
  // in STAFF_PERMISSION_KEYS but are not yet wired into any RLS predicate
  // or app-layer check for catalog writes (see docs/phase2-catalog-management.md
  // "Known gap"). Any active manager can currently write here.
  const canManage = hasMinCinemaStaffRole({ role, status: "active" }, "manager");

  const supabase = await createServerSupabaseClient();

  const [{ data: catalogData }, { data: cinemaMoviesData, error: cinemaMoviesError }] =
    await Promise.all([
      supabase
        .from("movies")
        .select("id, title, duration_minutes, rating")
        .order("title", { ascending: true }),
      supabase
        .from("cinema_movies")
        .select("movie_id, movies:movie_id(id, title, duration_minutes, rating)")
        .eq("cinema_id", cinemaId),
    ]);

  if (cinemaMoviesError) notFound();

  const catalog = (catalogData ?? []) as CatalogMovieRow[];
  const cinemaMovies = (cinemaMoviesData ?? []) as unknown as CinemaMovieRow[];
  const selectedIds = new Set(cinemaMovies.map((cm) => cm.movie_id));
  const availableToAdd = catalog.filter((movie) => !selectedIds.has(movie.id));

  return (
    <main>
      <h1>Movies</h1>
      <p>Select which titles from the platform catalog this cinema shows.</p>

      <section>
        <h2>Currently showing ({cinemaMovies.length})</h2>
        {cinemaMovies.length === 0 ? (
          <p>No movies selected yet.</p>
        ) : (
          <ul>
            {cinemaMovies.map((cm) => (
              <li key={cm.movie_id}>
                {cm.movies?.title ?? "Unknown title"} — {cm.movies?.duration_minutes ?? "?"} min
                {cm.movies?.rating ? ` — ${cm.movies.rating}` : ""}
                {canManage && <RemoveMovieButton cinemaId={cinemaId} movieId={cm.movie_id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <section>
          <h2>Add from catalog</h2>
          {availableToAdd.length === 0 ? (
            <p>Every catalog title has already been added.</p>
          ) : (
            <AddMovieForm cinemaId={cinemaId} movies={availableToAdd} />
          )}
        </section>
      )}
      {!canManage && (
        <p>Only the cinema owner or a manager can add or remove movies for this cinema.</p>
      )}
    </main>
  );
}
