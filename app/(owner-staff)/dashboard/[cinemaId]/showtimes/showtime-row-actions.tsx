"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useEffect, useState } from "react";
import { updateShowtimePrice, deleteShowtime } from "@/lib/actions/showtimes";
import type { ActionResult } from "@/lib/actions/cinemas";
import ui from "@/app/ui.module.css";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton({
  pendingLabel,
  label,
  variant = "ghost",
}: {
  pendingLabel: string;
  label: string;
  variant?: "ghost" | "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const className =
    variant === "primary" ? ui.buttonPrimary : variant === "danger" ? ui.buttonDanger : ui.buttonGhost;
  return (
    <button type="submit" disabled={pending} className={`${className} ${ui.buttonSmall}`}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ShowtimeRowActions({
  cinemaId,
  showtimeId,
  currentPrice,
  canManageShowtimes,
  canManagePricing,
}: {
  cinemaId: string;
  showtimeId: string;
  currentPrice: string;
  /** Gates the Delete button — matches the 'manage_showtimes' permission. */
  canManageShowtimes: boolean;
  /** Gates the Edit price control — matches the 'manage_pricing' permission. Deliberately independent of canManageShowtimes: neither permission implies the other. */
  canManagePricing: boolean;
}) {
  const [priceState, priceAction] = useActionState(updateShowtimePrice, initialState);
  const [deleteState, deleteAction] = useActionState(deleteShowtime, initialState);
  const [editingPrice, setEditingPrice] = useState(false);

  // On a successful save, collapse back to the plain "Edit price" button so
  // the "Price updated." confirmation is shown where the user is actually
  // looking, rather than left sitting unseen behind a still-open edit form.
  useEffect(() => {
    if (priceState.ok) {
      setEditingPrice(false);
    }
  }, [priceState]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      {canManagePricing &&
        (editingPrice ? (
          <form action={priceAction} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <input type="hidden" name="showtimeId" value={showtimeId} />
            <input
              className={ui.input}
              name="basePrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={currentPrice}
              required
              style={{ width: 90, padding: "6px 8px" }}
            />
            <SubmitButton pendingLabel="Saving..." label="Save" variant="primary" />
            <button type="button" onClick={() => setEditingPrice(false)} className={`${ui.buttonGhost} ${ui.buttonSmall}`}>
              Cancel
            </button>
            {!priceState.ok && priceState.error && (
              <p role="alert" className={ui.alertError} style={{ margin: 0, width: "100%" }}>
                {priceState.error}
              </p>
            )}
          </form>
        ) : (
          <>
            <button type="button" onClick={() => setEditingPrice(true)} className={`${ui.buttonGhost} ${ui.buttonSmall}`}>
              Edit price
            </button>
            {/* Only shown right after a successful save, in the collapsed
                view — reopening the editor (setEditingPrice(true) above)
                hides it again, so it never lingers as a stale confirmation
                for an unrelated later edit. */}
            {priceState.ok && (
              <p role="status" className={ui.alertSuccess} style={{ margin: 0 }}>
                Price updated.
              </p>
            )}
          </>
        ))}

      {canManageShowtimes && (
        <form action={deleteAction}>
          <input type="hidden" name="cinemaId" value={cinemaId} />
          <input type="hidden" name="showtimeId" value={showtimeId} />
          <SubmitButton pendingLabel="Deleting..." label="Delete" variant="danger" />
          {!deleteState.ok && deleteState.error && (
            <p role="alert" className={ui.alertError} style={{ margin: "4px 0 0" }}>
              {deleteState.error}
            </p>
          )}
          {deleteState.ok && (
            <p role="status" className={ui.alertSuccess} style={{ margin: "4px 0 0" }}>
              Showtime deleted.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
