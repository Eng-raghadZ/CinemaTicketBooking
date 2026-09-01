"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { acceptStaffInvite } from "@/lib/actions/staff";
import type { ActionResult } from "@/lib/actions/cinemas";
import { useAppPreferences } from "@/components/app-providers";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  const { locale } = useAppPreferences();
  return (
    <button className="primary-button compact" type="submit" disabled={pending}>
      {pending ? (locale === "ar" ? "جارٍ القبول..." : "Accepting...") : (locale === "ar" ? "قبول الدعوة" : "Accept invite")}
    </button>
  );
}

export function AcceptInviteButton({ staffId }: { staffId: string }) {
  const [state, formAction] = useActionState(acceptStaffInvite, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="staffId" value={staffId} />
      <SubmitButton />
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
