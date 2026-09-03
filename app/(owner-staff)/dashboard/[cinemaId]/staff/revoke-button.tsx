"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { revokeStaffAccess } from "@/lib/actions/staff";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton({ isSelf }: { isSelf: boolean }) {
  const { pending } = useFormStatus();
  if (isSelf) {
    return (
      <button type="submit" disabled={pending} className={`${ui.buttonGhost} ${ui.buttonSmall}`}>
        {pending ? "Leaving..." : "Leave cinema"}
      </button>
    );
  }
  return (
    <button type="submit" disabled={pending} className={`${ui.buttonDanger} ${ui.buttonSmall}`}>
      {pending ? "Revoking..." : "Revoke"}
    </button>
  );
}

/**
 * Same `revokeStaffAccess` action and the same authorization/lifecycle as
 * before (active -> revoked, owners excluded, caller must pass
 * canManageCinemaStaff — see lib/actions/staff.ts and
 * supabase/migrations/0010_cinema_staff_update_guards.sql). `isSelf` only
 * changes the label: revoking your own membership reads as "Leave cinema"
 * rather than "Revoke".
 */
export function RevokeStaffButton({
  cinemaId,
  staffId,
  isSelf = false,
}: {
  cinemaId: string;
  staffId: string;
  isSelf?: boolean;
}) {
  const [state, formAction] = useActionState(revokeStaffAccess, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <input type="hidden" name="staffId" value={staffId} />
      <SubmitButton isSelf={isSelf} />
      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError} style={{ marginTop: 6 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
