"use client";

import { useFormState, useFormStatus } from "react-dom";
import { inviteStaff } from "@/lib/actions/staff";
import { STAFF_PERMISSION_KEYS } from "@/lib/validation/staff";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Sending invite..." : "Invite"}
    </button>
  );
}

export function InviteStaffForm({ cinemaId }: { cinemaId: string }) {
  const [state, formAction] = useFormState(inviteStaff, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <h2>Invite staff member</h2>

      <label>
        Email (must already have an account)
        <input type="email" name="email" required />
      </label>
      {!state.ok && state.fieldErrors?.email && <p role="alert">{state.fieldErrors.email[0]}</p>}

      <fieldset>
        <legend>Role</legend>
        <label>
          <input type="radio" name="role" value="manager" defaultChecked /> Manager
        </label>
        <label>
          <input type="radio" name="role" value="staff" /> Staff
        </label>
      </fieldset>

      <fieldset>
        <legend>
          Permissions (relevant to the Manager role — Staff-tier scope is fixed by role alone)
        </legend>
        {STAFF_PERMISSION_KEYS.map((key) => (
          <label key={key}>
            <input type="checkbox" name={`perm_${key}`} /> {key.replace(/_/g, " ")}
          </label>
        ))}
      </fieldset>

      {!state.ok && state.error && <p role="alert">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
