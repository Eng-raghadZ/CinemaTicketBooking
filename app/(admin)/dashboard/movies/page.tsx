import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { MovieForm } from "./movie-form";
import ui from "@/app/ui.module.css";

interface MovieRow {
  id: string;
  title: string;
  description: string | null;
  poster_url: string | null;
  duration_minutes: number;
  rating: string | null;
  created_at: string;
}

export default async function AdminMoviesPage() {
  await requirePlatformAdmin();

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("movies")
    .select("id, title, description, poster_url, duration_minutes, rating, created_at")
    .order("created_at", { ascending: false });

  const movies = (data ?? []) as MovieRow[];

  return (
    <main className={ui.container}>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Movie catalog</h1>
        <p className={ui.pageSubtitle}>
          This is the platform-wide master catalog. Cinema owners select from
          these titles for their own cinema&apos;s listing — they cannot
          create or edit catalog entries directly.
        </p>
      </div>

      <section className={ui.section}>
        <div className={ui.sectionHeader}>
          <h2 className={ui.sectionTitle}>Add a movie</h2>
        </div>
        <MovieForm />
      </section>

      <section className={ui.section}>
        <div className={ui.sectionHeader}>
          <h2 className={ui.sectionTitle}>Existing movies ({movies.length})</h2>
        </div>
        {movies.length === 0 ? (
          <p className={ui.emptyState}>No movies in the catalog yet.</p>
        ) : (
          <div className={ui.grid}>
            {movies.map((movie) => (
              <div key={movie.id} className={ui.card}>
                <p style={{ margin: "0 0 6px", fontSize: 14 }}>{movie.title}</p>
                <p style={{ margin: "0 0 8px", color: "var(--color-text-muted)", fontSize: 12 }}>
                  {movie.duration_minutes} min
                  {movie.rating ? ` · ${movie.rating}` : ""}
                </p>
                {movie.description && (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
                    {movie.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
