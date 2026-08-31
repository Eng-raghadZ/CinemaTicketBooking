"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useState } from "react";
import { updateShowtimePrice, deleteShowtime } from "@/lib/actions/showtimes";
import type { ActionResult } from "@/lib/actions/cinemas";

const initialState: ActionResult = { ok: false, error: "" };

function SubmitButton({ pendingLabel, label }: { pendingLabel: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
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

  return (
    <div>
      {canManagePricing &&
        (editingPrice ? (
          <form action={priceAction}>
            <input type="hidden" name="cinemaId" value={cinemaId} />
            <input type="hidden" name="showtimeId" value={showtimeId} />
            <input
              name="basePrice"
              type="number"
              min={0}
              step="0.01"
              defaultValue={currentPrice}
              required
            />
            <SubmitButton pendingLabel="Saving..." label="Save price" />
            <button type="button" onClick={() => setEditingPrice(false)}>
              Cancel
            </button>
            {!priceState.ok && priceState.error && <p role="alert">{priceState.error}</p>}
          </form>
        ) : (
          <button type="button" onClick={() => setEditingPrice(true)}>
            Edit price
          </button>
        ))}

      {canManageShowtimes && (
        <form action={deleteAction}>
          <input type="hidden" name="cinemaId" value={cinemaId} />
          <input type="hidden" name="showtimeId" value={showtimeId} />
          <SubmitButton pendingLabel="Deleting..." label="Delete" />
          {!deleteState.ok && deleteState.error && <p role="alert">{deleteState.error}</p>}
        </form>
      )}
    </div>
  );
}
