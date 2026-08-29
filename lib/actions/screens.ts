"use server";

/**
 * Screen creation, with seat-grid generation done in one step. Authorization
 * mirrors screens_write_owner_manager / seats_write_owner_manager RLS
 * (supabase/migrations/0005_rls_policies.sql): owner or manager only.
 *
 * The screen row and its generated seats are two separate inserts against
 * PostgREST (no multi-statement transaction available through the caller's
 * RLS-scoped client), so this is NOT atomic at the database level. If the
 * seat insert fails after the screen insert succeeds, we make a best-effort
 * compensating delete of the screen so a caller never ends up with a
 * seatless screen silently sitting in their dashboard. This compensation
 * is itself best-effort (its own failure is swallowed) — a fully atomic
 * version would need a SECURITY DEFINER Postgres function, which is a
 * reasonable Phase 9 hardening candidate if orphaned screens turn out to
 * be a real problem in practice.
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { requireCinemaStaff } from "@/lib/auth/guards";
import { createScreenSchema } from "@/lib/validation/catalog";
import { generateSeatGrid } from "@/lib/catalog/seat-layout";
import type { ActionResult } from "./cinemas";

export async function createScreen(
  _prev: ActionResult<{ screenId: string }>,
  formData: FormData,
): Promise<ActionResult<{ screenId: string }>> {
  const parsed = createScreenSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    name: formData.get("name"),
    rows: formData.get("rows"),
    seatsPerRow: formData.get("seatsPerRow"),
    seatType: formData.get("seatType") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { cinemaId, name, rows, seatsPerRow, seatType } = parsed.data;

  await requireCinemaStaff(cinemaId, { minRole: "manager" });

  const seats = generateSeatGrid({ rows, seatsPerRow, seatType });
  if (seats.length > 3000) {
    // Sanity ceiling well above any real cinema screen — protects against a
    // pathological rows*seatsPerRow combination slipping through
    // individually-valid bounds (e.g. 60 x 60 = 3600).
    return {
      ok: false,
      error: "That screen configuration is too large. Reduce rows or seats per row.",
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: screen, error: screenError } = await supabase
    .from("screens")
    .insert({
      cinema_id: cinemaId,
      name,
      layout_config: { rows, seatsPerRow, seatType },
    })
    .select("id")
    .single();

  if (screenError || !screen) {
    return { ok: false, error: "Could not create screen. Please try again." };
  }

  const { error: seatsError } = await supabase.from("seats").insert(
    seats.map((seat) => ({
      screen_id: screen.id,
      row: seat.row,
      number: seat.number,
      seat_type: seat.seatType,
    })),
  );

  if (seatsError) {
    // Best-effort compensation — see file header. Its own failure is not
    // surfaced to the caller beyond the original error, since there's no
    // additional useful action they can take from the UI at that point.
    await supabase.from("screens").delete().eq("id", screen.id);
    return { ok: false, error: "Could not generate the seat grid. Please try again." };
  }

  revalidatePath(`/dashboard/${cinemaId}/screens`);
  return { ok: true, data: { screenId: screen.id } };
}
