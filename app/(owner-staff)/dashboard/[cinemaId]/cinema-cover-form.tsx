"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateCinemaCover, type ActionResult } from "@/lib/actions/cinemas";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save cover image"}
    </button>
  );
}

export function CinemaCoverForm({
  cinemaId,
  coverImageUrl,
}: {
  cinemaId: string;
  coverImageUrl: string | null;
}) {
  const [state, action] = useActionState(updateCinemaCover, {
    ok: false,
    error: "",
  } as ActionResult);

  return (
    <form action={action}>
      <input type="hidden" name="cinemaId" value={cinemaId} />
      <label>
        Cinema cover image URL
        <input
          name="coverImageUrl"
          type="url"
          maxLength={2000}
          defaultValue={coverImageUrl ?? ""}
          placeholder="https://..."
        />
      </label>
      {!state.ok && state.fieldErrors?.coverImageUrl && (
        <p role="alert">{state.fieldErrors.coverImageUrl[0]}</p>
      )}
      {!state.ok && state.error && <p role="alert">{state.error}</p>}
      {state.ok && <p role="status">Cinema cover updated.</p>}
      <SaveButton />
    </form>
  );
}
