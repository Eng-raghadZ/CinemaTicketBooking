"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import { createScreen } from "@/lib/actions/screens";
import { SEAT_TYPES } from "@/lib/catalog/seat-layout";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult<{ screenId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
      {pending ? "Creating..." : "Create screen"}
    </button>
  );
}

export function ScreenForm({ cinemaId }: { cinemaId: string }) {
  const [state, formAction] = useActionState(createScreen, initialState);
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
        <span className={ui.fieldLabel}>Screen name</span>
        <input className={ui.input} name="name" required maxLength={100} placeholder="e.g. Screen 1" />
      </label>
      {!state.ok && state.fieldErrors?.name && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.name[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Rows</span>
        <input className={ui.input} name="rows" type="number" required min={1} max={60} defaultValue={10} />
      </label>
      {!state.ok && state.fieldErrors?.rows && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.rows[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Seats per row</span>
        <input className={ui.input} name="seatsPerRow" type="number" required min={1} max={60} defaultValue={12} />
      </label>
      {!state.ok && state.fieldErrors?.seatsPerRow && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.seatsPerRow[0]}
        </p>
      )}

      <fieldset style={{ border: "1px solid var(--color-border)", padding: 14, margin: "0 0 18px" }}>
        <legend style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Seat type</legend>
        {SEAT_TYPES.map((type) => (
          <label key={type} className={ui.checkboxRow} style={{ textTransform: "capitalize" }}>
            <input type="radio" name="seatType" value={type} defaultChecked={type === "standard"} />{" "}
            {type}
          </label>
        ))}
      </fieldset>

      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className={ui.alertSuccess}>
          Screen created.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
