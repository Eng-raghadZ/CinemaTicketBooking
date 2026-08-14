/**
 * Check-in is a single atomic conditional UPDATE, run through the caller's
 * OWN RLS-scoped Supabase client (not service-role) — cinema staff must be
 * authorized for the specific cinema via the enforce_booking_update_scope
 * trigger (0004) and the bookings RLS policy (0005), not just "any logged-in
 * staff member." "0 rows affected" is the normal, expected outcome for an
 * already-checked-in or non-existent ticket — that's what makes double
 * check-in impossible without needing an application-level lock (see the
 * concurrency test in tests/integration/rls-and-constraints.test.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type CheckInResult =
  | { outcome: "checked_in"; bookingId: string }
  | { outcome: "already_checked_in_or_invalid" };

export async function checkInTicket(
  supabase: SupabaseClient,
  params: { ticketReference: string; staffId: string },
): Promise<CheckInResult> {
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      checked_in_by: params.staffId,
    })
    .eq("ticket_reference", params.ticketReference)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();

  // A real error (RLS denial, network, etc.) is distinct from "no rows
  // matched" (data === null with no error), which is the expected outcome
  // for a ticket that's already checked in / doesn't belong to this staff
  // member's cinema / doesn't exist.
  if (error) {
    throw error;
  }
  if (!data) {
    return { outcome: "already_checked_in_or_invalid" };
  }
  return { outcome: "checked_in", bookingId: data.id };
}
