import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import { MovieForm } from "./movie-form";

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
    <main>
      <h1>Movie catalog</h1>
      <p>
        This is the platform-wide master catalog. Cinema owners select from these titles for
        their own cinema&apos;s listing — they cannot create or edit catalog entries directly.
      </p>
      <SignOutButton />

      <section>
        <h2>Add a movie</h2>
        <MovieForm />
      </section>

      <section>
        <h2>Existing movies ({movies.length})</h2>
        {movies.length === 0 ? (
          <p>No movies in the catalog yet.</p>
        ) : (
          <ul>
            {movies.map((movie) => (
              <li key={movie.id}>
                <strong>{movie.title}</strong> — {movie.duration_minutes} min
                {movie.rating ? ` — ${movie.rating}` : ""}
                {movie.description ? <p>{movie.description}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
