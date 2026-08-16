"use client";

import { useFormState, useFormStatus } from "react-dom";
import { revokeStaffAccess } from "@/lib/actions/staff";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Revoking..." : "Revoke"}
    </button>
  );
}

export function RevokeStaffButton({ cinemaId, staffId }: { cinemaId: string; staffId: string }) {
  const [state, formAction] = useFormState(revokeStaffAccess, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <input type="hidden" name="staffId" value={staffId} />
      <SubmitButton />
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
