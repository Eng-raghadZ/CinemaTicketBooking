"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { registerCinema, type ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult<{ cinemaId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Submitting..." : "Submit for review"}
    </button>
  );
}

export function RegisterCinemaForm() {
  const [state, formAction] = useActionState(registerCinema, initialState);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.data?.cinemaId) {
      router.push(`/dashboard/${state.data.cinemaId}`);
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <label>
        Cinema name
        <input name="name" required maxLength={200} />
      </label>
      {!state.ok && state.fieldErrors?.name && <p role="alert">{state.fieldErrors.name[0]}</p>}

      <label>
        Description
        <textarea name="description" maxLength={2000} />
      </label>

      <label>
        Location
        <input name="location" maxLength={500} />
      </label>

      <label>
        Country code (ISO 3166-1 alpha-2, e.g. US)
        <input name="countryCode" required maxLength={2} />
      </label>
      {!state.ok && state.fieldErrors?.countryCode && <p role="alert">{state.fieldErrors.countryCode[0]}</p>}

      <label>
        Currency code (ISO 4217, e.g. USD)
        <input name="currencyCode" required maxLength={3} />
      </label>
      {!state.ok && state.fieldErrors?.currencyCode && (
        <p role="alert">{state.fieldErrors.currencyCode[0]}</p>
      )}

      {!state.ok && state.error && <p role="alert">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
