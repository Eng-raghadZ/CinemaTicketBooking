"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { removeCinemaMovie } from "@/lib/actions/cinema-movies";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Removing..." : "Remove"}
    </button>
  );
}

export function RemoveMovieButton({ cinemaId, movieId }: { cinemaId: string; movieId: string }) {
  const [state, formAction] = useActionState(removeCinemaMovie, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <input type="hidden" name="movieId" value={movieId} />
      <SubmitButton />
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
