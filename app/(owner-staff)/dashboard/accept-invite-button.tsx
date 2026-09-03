"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { acceptStaffInvite } from "@/lib/actions/staff";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
      {pending ? "Accepting..." : "Accept invite"}
    </button>
  );
}

export function AcceptInviteButton({ staffId }: { staffId: string }) {
  const [state, formAction] = useActionState(acceptStaffInvite, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="staffId" value={staffId} />
      <SubmitButton />
      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError}>
          {state.error}
        </p>
      )}
    </form>
  );
}
