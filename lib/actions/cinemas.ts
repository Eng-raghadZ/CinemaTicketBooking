"use server";

/**
 * Server Actions = backend API layer for cinema onboarding & review
 * (Phase 1). These sit at "layer 2" of the three-layer authorization model
 * (docs/security.md): they call the existing Phase 0 guards first, then use
 * the caller's own RLS-scoped Supabase client for the actual write, so
 * Postgres (layer 3) — including the 0004 status-transition triggers —
 * remains the final word on what's actually allowed.
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { requireAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/guards";
import { registerCinemaSchema, rejectCinemaSchema, cinemaIdSchema } from "@/lib/validation/cinema";
import { serviceDb } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

/**
 * audit_logs has NO insert policy for `authenticated` (see
 * docs/security.md — "Immutable... writes via service_role only"), so audit
 * entries for admin actions must go through the service-role client, never
 * the caller's session client. This is the one narrow, deliberate use of
 * serviceDb() outside the sweeper/webhook paths lib/db/client.ts documents.
 */
async function writeAuditLog(entry: {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = serviceDb();
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
  });
}

/**
 * Owner-submitted cinema registration. Relies on the `cinemas_insert_self_register`
 * RLS policy (primary_owner_id = auth.uid()) plus the `cinemas_enforce_initial_status`
 * trigger (0004), which forces status to 'pending_review' for any non-admin
 * caller regardless of what's sent — so there is no path here that can
 * bypass admin review, by construction, not just by this code's discipline.
 * The 0008 bootstrap trigger then gives the owner an active 'owner'
 * cinema_staff row automatically.
 */
export async function registerCinema(
  _prev: ActionResult<{ cinemaId: string }>,
  formData: FormData,
): Promise<ActionResult<{ cinemaId: string }>> {
  const { userId } = await requireAuthenticatedUser();

  const parsed = registerCinemaSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    location: formData.get("location"),
    countryCode: formData.get("countryCode"),
    currencyCode: formData.get("currencyCode"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinemas")
    .insert({
      primary_owner_id: userId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      location: parsed.data.location ?? null,
      country_code: parsed.data.countryCode,
      currency_code: parsed.data.currencyCode,
      // status intentionally omitted — defaults to 'pending_review' and is
      // force-set by the 0004 trigger regardless; see integration test
      // "A newly self-registered cinema is forced to pending_review".
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not register cinema. Please try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true, data: { cinemaId: data.id } };
}

export async function approveCinema(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = cinemaIdSchema.safeParse({ cinemaId: formData.get("cinemaId") });
  if (!parsed.success) return { ok: false, error: "Invalid cinema id." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinemas")
    .update({
      status: "approved",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", parsed.data.cinemaId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not approve cinema." };
  if (!data) return { ok: false, error: "Cinema not found." };

  await writeAuditLog({ actorId: userId, action: "cinema.approved", entity: "cinema", entityId: data.id });

  revalidatePath("/dashboard/cinemas");
  revalidatePath(`/dashboard/cinemas/${data.id}`);
  return { ok: true };
}

export async function rejectCinema(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = rejectCinemaSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    rejectionReason: formData.get("rejectionReason"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please provide a rejection reason.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinemas")
    .update({
      status: "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: parsed.data.rejectionReason,
    })
    .eq("id", parsed.data.cinemaId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not reject cinema." };
  if (!data) return { ok: false, error: "Cinema not found." };

  await writeAuditLog({
    actorId: userId,
    action: "cinema.rejected",
    entity: "cinema",
    entityId: data.id,
    metadata: { reason: parsed.data.rejectionReason },
  });

  revalidatePath("/dashboard/cinemas");
  revalidatePath(`/dashboard/cinemas/${data.id}`);
  return { ok: true };
}

export async function suspendCinema(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = cinemaIdSchema.safeParse({ cinemaId: formData.get("cinemaId") });
  if (!parsed.success) return { ok: false, error: "Invalid cinema id." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinemas")
    .update({ status: "suspended", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", parsed.data.cinemaId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not suspend cinema." };
  if (!data) return { ok: false, error: "Cinema not found." };

  await writeAuditLog({ actorId: userId, action: "cinema.suspended", entity: "cinema", entityId: data.id });

  revalidatePath("/dashboard/cinemas");
  revalidatePath(`/dashboard/cinemas/${data.id}`);
  return { ok: true };
}

/** Re-approves a previously suspended cinema. Distinct from `approveCinema` so a pending_review cinema can never be "reinstated" past review by mistake. */
export async function reinstateCinema(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin();
  const parsed = cinemaIdSchema.safeParse({ cinemaId: formData.get("cinemaId") });
  if (!parsed.success) return { ok: false, error: "Invalid cinema id." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinemas")
    .update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", parsed.data.cinemaId)
    .eq("status", "suspended")
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not reinstate cinema." };
  if (!data) return { ok: false, error: "Cinema not found or not currently suspended." };

  await writeAuditLog({ actorId: userId, action: "cinema.reinstated", entity: "cinema", entityId: data.id });

  revalidatePath("/dashboard/cinemas");
  revalidatePath(`/dashboard/cinemas/${data.id}`);
  return { ok: true };
}
