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

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
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
      <h2>Review actions</h2>

      {status === "pending_review" && (
        <>
          <form action={approveAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <SubmitButton>Approve</SubmitButton>
          </form>
          {!approveState.ok && approveState.error && <p role="alert">{approveState.error}</p>}

          <form action={rejectAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <label>
              Rejection reason
              <textarea name="rejectionReason" required minLength={10} maxLength={1000} />
            </label>
            {!rejectState.ok && rejectState.fieldErrors?.rejectionReason && (
              <p role="alert">{rejectState.fieldErrors.rejectionReason[0]}</p>
            )}
            <SubmitButton>Reject</SubmitButton>
          </form>
          {!rejectState.ok && rejectState.error && <p role="alert">{rejectState.error}</p>}
        </>
      )}

      {status === "approved" && (
        <>
          <form action={suspendAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <SubmitButton>Suspend</SubmitButton>
          </form>
          {!suspendState.ok && suspendState.error && <p role="alert">{suspendState.error}</p>}
        </>
      )}

      {status === "suspended" && (
        <>
          <form action={reinstateAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <SubmitButton>Reinstate (re-approve)</SubmitButton>
          </form>
          {!reinstateState.ok && reinstateState.error && <p role="alert">{reinstateState.error}</p>}
        </>
      )}

      {status === "rejected" && <p>This cinema was rejected. The owner would need to submit a new registration.</p>}
    </section>
  );
}
