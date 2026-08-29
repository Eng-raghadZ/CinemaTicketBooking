"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import { createMovie } from "@/lib/actions/movies";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult<{ movieId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Adding..." : "Add movie"}
    </button>
  );
}

export function MovieForm() {
  const [state, formAction] = useActionState(createMovie, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form action={formAction} ref={formRef}>
      <label>
        Title
        <input name="title" required maxLength={200} />
      </label>
      {!state.ok && state.fieldErrors?.title && <p role="alert">{state.fieldErrors.title[0]}</p>}

      <label>
        Description
        <textarea name="description" maxLength={5000} />
      </label>

      <label>
        Poster URL
        <input name="posterUrl" type="url" maxLength={2000} />
      </label>
      {!state.ok && state.fieldErrors?.posterUrl && (
        <p role="alert">{state.fieldErrors.posterUrl[0]}</p>
      )}

      <label>
        Duration (minutes)
        <input name="durationMinutes" type="number" required min={1} max={1000} />
      </label>
      {!state.ok && state.fieldErrors?.durationMinutes && (
        <p role="alert">{state.fieldErrors.durationMinutes[0]}</p>
      )}

      <label>
        Rating
        <input name="rating" maxLength={20} placeholder="e.g. PG-13" />
      </label>

      {!state.ok && state.error && <p role="alert">{state.error}</p>}
      {state.ok && <p role="status">Movie added.</p>}

      <SubmitButton />
    </form>
  );
}
