"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { addCinemaMovie } from "@/lib/actions/cinema-movies";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Adding..." : "Add to cinema"}
    </button>
  );
}

interface CatalogMovieOption {
  id: string;
  title: string;
  duration_minutes: number;
  rating: string | null;
}

export function AddMovieForm({
  cinemaId,
  movies,
}: {
  cinemaId: string;
  movies: CatalogMovieOption[];
}) {
  const [state, formAction] = useActionState(addCinemaMovie, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <label>
        Movie
        <select name="movieId" required defaultValue="">
          <option value="" disabled>
            Select a movie
          </option>
          {movies.map((movie) => (
            <option key={movie.id} value={movie.id}>
              {movie.title} ({movie.duration_minutes} min
              {movie.rating ? `, ${movie.rating}` : ""})
            </option>
          ))}
        </select>
      </label>
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
