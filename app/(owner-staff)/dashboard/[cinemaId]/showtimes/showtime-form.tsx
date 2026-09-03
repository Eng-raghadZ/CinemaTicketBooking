"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import { createShowtime } from "@/lib/actions/showtimes";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult<{ showtimeId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
      {pending ? "Scheduling..." : "Schedule showtime"}
    </button>
  );
}

interface ScreenOption {
  id: string;
  name: string;
}

interface MovieOption {
  id: string;
  title: string;
  duration_minutes: number;
}

export function ShowtimeForm({
  cinemaId,
  screens,
  movies,
}: {
  cinemaId: string;
  screens: ScreenOption[];
  movies: MovieOption[];
}) {
  const [state, formAction] = useActionState(createShowtime, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form action={formAction} ref={formRef} className={ui.card} style={{ maxWidth: 420 }} noValidate>
      <input type="hidden" name="cinemaId" value={cinemaId} />

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Movie</span>
        <select className={ui.select} name="movieId" required defaultValue="">
          <option value="" disabled>
            Select a movie
          </option>
          {movies.map((movie) => (
            <option key={movie.id} value={movie.id}>
              {movie.title} ({movie.duration_minutes} min)
            </option>
          ))}
        </select>
      </label>
      {!state.ok && state.fieldErrors?.movieId && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.movieId[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Screen</span>
        <select className={ui.select} name="screenId" required defaultValue="">
          <option value="" disabled>
            Select a screen
          </option>
          {screens.map((screen) => (
            <option key={screen.id} value={screen.id}>
              {screen.name}
            </option>
          ))}
        </select>
      </label>
      {!state.ok && state.fieldErrors?.screenId && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.screenId[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Starts at</span>
        <input className={ui.input} name="startsAt" type="datetime-local" required />
      </label>
      {!state.ok && state.fieldErrors?.startsAt && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.startsAt[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Base price</span>
        <input className={ui.input} name="basePrice" type="number" required min={0} step="0.01" />
      </label>
      {!state.ok && state.fieldErrors?.basePrice && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.basePrice[0]}
        </p>
      )}

      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className={ui.alertSuccess}>
          Showtime scheduled.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
