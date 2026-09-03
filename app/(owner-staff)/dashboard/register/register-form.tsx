"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { registerCinema, type ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult<{ cinemaId: string }> = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
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
    <form action={formAction} noValidate>
      <label className={ui.field}>
        <span className={ui.fieldLabel}>Cinema name</span>
        <input className={ui.input} name="name" required maxLength={200} />
      </label>
      {!state.ok && state.fieldErrors?.name && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.name[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Description</span>
        <textarea className={ui.textarea} name="description" maxLength={2000} />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Location</span>
        <input className={ui.input} name="location" maxLength={500} />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Country code</span>
        <input className={ui.input} name="countryCode" required maxLength={2} placeholder="e.g. US" />
        <span className={ui.fieldHint}>ISO 3166-1 alpha-2</span>
      </label>
      {!state.ok && state.fieldErrors?.countryCode && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.countryCode[0]}
        </p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Currency code</span>
        <input className={ui.input} name="currencyCode" required maxLength={3} placeholder="e.g. USD" />
        <span className={ui.fieldHint}>ISO 4217</span>
      </label>
      {!state.ok && state.fieldErrors?.currencyCode && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.currencyCode[0]}
        </p>
      )}

      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError}>
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
