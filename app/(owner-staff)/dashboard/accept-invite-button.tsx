"use client";

import { useFormState, useFormStatus } from "react-dom";
import { acceptStaffInvite } from "@/lib/actions/staff";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Accepting..." : "Accept invite"}
    </button>
  );
}

export function AcceptInviteButton({ staffId }: { staffId: string }) {
  const [state, formAction] = useFormState(acceptStaffInvite, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="staffId" value={staffId} />
      <SubmitButton />
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
