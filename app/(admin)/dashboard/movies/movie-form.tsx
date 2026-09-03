"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import { createMovie } from "@/lib/actions/movies";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult<{ movieId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
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
    <form action={formAction} ref={formRef} className={ui.card} style={{ maxWidth: 480 }} noValidate>
      <label className={ui.field}>
        <span className={ui.fieldLabel}>Title</span>
        <input className={ui.input} name="title" required maxLength={200} />
      </label>
      {!state.ok && state.fieldErrors?.title && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.title[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Description</span>
        <textarea className={ui.textarea} name="description" maxLength={5000} />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Poster URL</span>
        <input className={ui.input} name="posterUrl" type="url" maxLength={2000} />
      </label>
      {!state.ok && state.fieldErrors?.posterUrl && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.posterUrl[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Duration (minutes)</span>
        <input className={ui.input} name="durationMinutes" type="number" required min={1} max={1000} />
      </label>
      {!state.ok && state.fieldErrors?.durationMinutes && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.durationMinutes[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Rating</span>
        <input className={ui.input} name="rating" maxLength={20} placeholder="e.g. PG-13" />
      </label>

      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className={ui.alertSuccess}>
          Movie added.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
