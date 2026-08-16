"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { requireAuthenticatedUser, requireCinemaStaff } from "@/lib/auth/guards";
import { canManageCinemaStaff, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { inviteStaffSchema } from "@/lib/validation/staff";
import { serviceDb } from "@/lib/db/client";
import { auditLogs, users as usersTable } from "@/lib/db/schema";
import type { ActionResult } from "./cinemas";

/**
 * Invite a staff member by email to a specific cinema.
 *
 * Design note: the invited person must already have a platform account —
 * self-service signup-via-invite-link needs an email send, which is a
 * Phase 7 concern per architecture-plan.md ("Notification abstraction +
 * Resend email implementation... Can run in parallel with Phase 6, both
 * depend on Phase 5"). For now this creates the cinema_staff row in
 * 'invited' status; the invitee sees and accepts it from their own
 * dashboard (app/(owner-staff)/dashboard/page.tsx) next time they sign in.
 * Wiring an actual invite email through lib/notifications is a drop-in
 * addition later, not a redesign — same pattern as ticketing/QR in v1.
 */
export async function inviteStaff(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requireAuthenticatedUser();

  const parsed = inviteStaffSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    email: formData.get("email"),
    role: formData.get("role"),
    permissions: {
      manage_staff: formData.get("perm_manage_staff") === "on",
      manage_showtimes: formData.get("perm_manage_showtimes") === "on",
      manage_pricing: formData.get("perm_manage_pricing") === "on",
      manage_screens: formData.get("perm_manage_screens") === "on",
      view_bookings: formData.get("perm_view_bookings") === "on",
      manage_bookings: formData.get("perm_manage_bookings") === "on",
      check_in_tickets: formData.get("perm_check_in_tickets") === "on",
    },
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { cinemaId, email, role, permissions } = parsed.data;

  // Layer 2: caller must be active staff on THIS cinema at all (requireCinemaStaff
  // throws ForbiddenError otherwise — the "manager for Cinema A rejected
  // server-side if they try to touch Cinema B" guarantee from the architecture).
  await requireCinemaStaff(cinemaId);

  const supabase = await createServerSupabaseClient();
  const { data: callerMembership } = await supabase
    .from("cinema_staff")
    .select("role, status, permissions")
    .eq("cinema_id", cinemaId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!canManageCinemaStaff(callerMembership as CinemaStaffMembership | null)) {
    return { ok: false, error: "You do not have permission to invite staff for this cinema." };
  }

  // Resolving an arbitrary email to a user id needs the service-role client:
  // `users` RLS only lets a caller read their own row (users_select_own).
  const db = serviceDb();
  const [invitee] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!invitee) {
    return {
      ok: false,
      error: "No account found for that email. The person must sign up before being invited.",
    };
  }

  const { error: insertError } = await supabase.from("cinema_staff").insert({
    cinema_id: cinemaId,
    user_id: invitee.id,
    role,
    permissions,
    invited_by: userId,
    status: "invited",
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return { ok: false, error: "This person already has a staff record for this cinema." };
    }
    return { ok: false, error: "Could not send invite. Please try again." };
  }

  await db.insert(auditLogs).values({
    actorId: userId,
    action: "cinema_staff.invited",
    entity: "cinema_staff",
    metadata: { cinemaId, inviteeEmail: email, role },
  });

  revalidatePath(`/dashboard/${cinemaId}/staff`);
  return { ok: true };
}

/** The invited user accepts their own invite. RLS's cinema_staff_update policy (user_id = auth.uid()) is what actually authorizes this — the query here just expresses it. */
export async function acceptStaffInvite(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requireAuthenticatedUser();
  const staffId = formData.get("staffId");
  if (typeof staffId !== "string" || staffId.length === 0) {
    return { ok: false, error: "Invalid invite." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinema_staff")
    .update({ status: "active" })
    .eq("id", staffId)
    .eq("user_id", userId)
    .eq("status", "invited")
    .select("id, cinema_id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not accept invite." };
  if (!data) return { ok: false, error: "Invite not found, already accepted, or not yours." };

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${data.cinema_id}/staff`);
  return { ok: true };
}

export async function revokeStaffAccess(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requireAuthenticatedUser();
  const staffId = formData.get("staffId");
  const cinemaId = formData.get("cinemaId");
  if (typeof staffId !== "string" || typeof cinemaId !== "string") {
    return { ok: false, error: "Invalid request." };
  }

  await requireCinemaStaff(cinemaId);

  const supabase = await createServerSupabaseClient();
  const { data: callerMembership } = await supabase
    .from("cinema_staff")
    .select("role, status, permissions")
    .eq("cinema_id", cinemaId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!canManageCinemaStaff(callerMembership as CinemaStaffMembership | null)) {
    return { ok: false, error: "You do not have permission to manage staff for this cinema." };
  }

  const { data, error } = await supabase
    .from("cinema_staff")
    .update({ status: "revoked" })
    .eq("id", staffId)
    .eq("cinema_id", cinemaId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not revoke access." };
  if (!data) return { ok: false, error: "Staff record not found." };

  const db = serviceDb();
  await db.insert(auditLogs).values({
    actorId: userId,
    action: "cinema_staff.revoked",
    entity: "cinema_staff",
    entityId: staffId,
    metadata: { cinemaId },
  });

  revalidatePath(`/dashboard/${cinemaId}/staff`);
  return { ok: true };
}
