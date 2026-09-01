"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { revokeStaffAccess } from "@/lib/actions/staff";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton({ isSelf }: { isSelf: boolean }) {
  const { pending } = useFormStatus();
  if (isSelf) {
    return (
      <button type="submit" disabled={pending}>
        {pending ? "Leaving..." : "Leave cinema"}
      </button>
    );
  }
  return (
    <button type="submit" disabled={pending}>
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
 * rather than "Revoke", which is what it actually means for the person
 * clicking it. This never grants a plain staff member (without
 * manage_staff) a new way to remove themselves — that button is still only
 * rendered for callers who already pass `canManageCinemaStaff`, matching
 * the existing, unmodified database-level authorization.
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
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
