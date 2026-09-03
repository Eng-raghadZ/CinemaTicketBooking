"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { addCinemaMovie } from "@/lib/actions/cinema-movies";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
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
    <form action={formAction} style={{ maxWidth: 420, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <label className={ui.field} style={{ flex: 1, minWidth: 220, margin: 0 }}>
        <span className={ui.fieldLabel}>Movie</span>
        <select className={ui.select} name="movieId" required defaultValue="">
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
      <SubmitButton />
      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError} style={{ width: "100%", margin: 0 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
