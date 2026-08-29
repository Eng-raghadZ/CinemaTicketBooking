"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useRef } from "react";
import { createScreen } from "@/lib/actions/screens";
import { SEAT_TYPES } from "@/lib/catalog/seat-layout";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult<{ screenId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
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
    <form action={formAction} ref={formRef}>
      <input type="hidden" name="cinemaId" value={cinemaId} />

      <label>
        Screen name
        <input name="name" required maxLength={100} placeholder="e.g. Screen 1" />
      </label>
      {!state.ok && state.fieldErrors?.name && <p role="alert">{state.fieldErrors.name[0]}</p>}

      <label>
        Rows
        <input name="rows" type="number" required min={1} max={60} defaultValue={10} />
      </label>
      {!state.ok && state.fieldErrors?.rows && <p role="alert">{state.fieldErrors.rows[0]}</p>}

      <label>
        Seats per row
        <input name="seatsPerRow" type="number" required min={1} max={60} defaultValue={12} />
      </label>
      {!state.ok && state.fieldErrors?.seatsPerRow && (
        <p role="alert">{state.fieldErrors.seatsPerRow[0]}</p>
      )}

      <fieldset>
        <legend>Seat type</legend>
        {SEAT_TYPES.map((type) => (
          <label key={type}>
            <input type="radio" name="seatType" value={type} defaultChecked={type === "standard"} />{" "}
            {type}
          </label>
        ))}
      </fieldset>

      {!state.ok && state.error && <p role="alert">{state.error}</p>}
      {state.ok && <p role="status">Screen created.</p>}

      <SubmitButton />
    </form>
  );
}
