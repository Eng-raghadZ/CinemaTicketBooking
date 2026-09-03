"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import {
  approveCinema,
  rejectCinema,
  suspendCinema,
  reinstateCinema,
  type ActionResult,
} from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "danger" | "ghost";
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "danger" ? ui.buttonDanger : variant === "ghost" ? ui.buttonGhost : ui.buttonPrimary;
  return (
    <button type="submit" disabled={pending} className={className}>
      {children}
    </button>
  );
}

export function CinemaReviewActions({
  cinemaId,
  status,
}: {
  cinemaId: string;
  status: "pending_review" | "approved" | "suspended" | "rejected";
}) {
  const [approveState, approveAction] = useActionState(approveCinema, initialState);
  const [rejectState, rejectAction] = useActionState(rejectCinema, initialState);
  const [suspendState, suspendAction] = useActionState(suspendCinema, initialState);
  const [reinstateState, reinstateAction] = useActionState(reinstateCinema, initialState);

  return (
    <section>
      <h2 className={ui.sectionTitle} style={{ marginBottom: 16 }}>
        Review actions
      </h2>

      {status === "pending_review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 420 }}>
          <div>
            <form action={approveAction}>
              <input type="hidden" name="cinemaId" value={cinemaId} />
              <SubmitButton>Approve</SubmitButton>
            </form>
            {!approveState.ok && approveState.error && (
              <p role="alert" className={ui.alertError}>
                {approveState.error}
              </p>
            )}
          </div>

          <form action={rejectAction} className={ui.card}>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Rejection reason</span>
              <textarea className={ui.textarea} name="rejectionReason" required minLength={10} maxLength={1000} />
            </label>
            {!rejectState.ok && rejectState.fieldErrors?.rejectionReason && (
              <p role="alert" className={ui.alertError}>
                {rejectState.fieldErrors.rejectionReason[0]}
              </p>
            )}
            {!rejectState.ok && rejectState.error && (
              <p role="alert" className={ui.alertError}>
                {rejectState.error}
              </p>
            )}
            <SubmitButton variant="danger">Reject</SubmitButton>
          </form>
        </div>
      )}

      {status === "approved" && (
        <div>
          <form action={suspendAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <SubmitButton variant="danger">Suspend</SubmitButton>
          </form>
          {!suspendState.ok && suspendState.error && (
            <p role="alert" className={ui.alertError}>
              {suspendState.error}
            </p>
          )}
        </div>
      )}

      {status === "suspended" && (
        <div>
          <form action={reinstateAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <SubmitButton>Reinstate (re-approve)</SubmitButton>
          </form>
          {!reinstateState.ok && reinstateState.error && (
            <p role="alert" className={ui.alertError}>
              {reinstateState.error}
            </p>
          )}
        </div>
      )}

      {status === "rejected" && (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          This cinema was rejected. The owner would need to submit a new registration.
        </p>
      )}
    </section>
  );
}
