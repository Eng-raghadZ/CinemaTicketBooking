"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { inviteStaff } from "@/lib/actions/staff";
import { STAFF_PERMISSION_KEYS } from "@/lib/validation/staff";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={ui.buttonPrimary}>
      {pending ? "Sending invite..." : "Invite"}
    </button>
  );
}

export function InviteStaffForm({ cinemaId }: { cinemaId: string }) {
  const [state, formAction] = useActionState(inviteStaff, initialState);

  return (
    <form action={formAction} className={ui.card} style={{ maxWidth: 480 }} noValidate>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <h2 className={ui.sectionTitle} style={{ marginBottom: 16 }}>
        Invite staff member
      </h2>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Email (must already have an account)</span>
        <input className={ui.input} type="email" name="email" required />
      </label>
      {!state.ok && state.fieldErrors?.email && (
        <p role="alert" className={ui.alertError}>
          {state.fieldErrors.email[0]}
        </p>
      )}

      <fieldset style={{ border: "1px solid var(--color-border)", padding: 14, margin: "0 0 18px" }}>
        <legend style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Role</legend>
        <label className={ui.checkboxRow}>
          <input type="radio" name="role" value="manager" defaultChecked /> Manager
        </label>
        <label className={ui.checkboxRow}>
          <input type="radio" name="role" value="staff" /> Staff
        </label>
      </fieldset>

      <fieldset style={{ border: "1px solid var(--color-border)", padding: 14, margin: "0 0 18px" }}>
        <legend style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Permissions (relevant to the Manager role — Staff-tier scope is fixed by role alone)
        </legend>
        {STAFF_PERMISSION_KEYS.map((key) => (
          <label key={key} className={ui.checkboxRow} style={{ textTransform: "capitalize" }}>
            <input type="checkbox" name={`perm_${key}`} /> {key.replace(/_/g, " ")}
          </label>
        ))}
      </fieldset>

      {!state.ok && state.error && (
        <p role="alert" className={ui.alertError}>
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
