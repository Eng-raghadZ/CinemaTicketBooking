"use server";

/**
 * Master movie catalog — platform-admin-only writes (architecture-plan.md
 * Section 11, Decision 3; enforced by movies_write_admin_only RLS policy in
 * supabase/migrations/0005_rls_policies.sql). Layer 2 (requirePlatformAdmin)
 * and layer 3 (RLS) are independently correct, same pattern as
 * lib/actions/cinemas.ts.
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { movieSchema, updateMovieSchema } from "@/lib/validation/catalog";
import { serviceDb } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
import type { ActionResult } from "./cinemas";

async function writeAuditLog(entry: {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  // audit_logs has no INSERT policy for `authenticated` (docs/security.md),
  // so this goes through the service-role client — same narrow, deliberate
  // exception documented in lib/actions/cinemas.ts.
  const db = serviceDb();
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    metadata: entry.metadata ?? {},
  });
}

export async function createMovie(
  _prev: ActionResult<{ movieId: string }>,
  formData: FormData,
): Promise<ActionResult<{ movieId: string }>> {
  const { userId } = await requirePlatformAdmin();

  const parsed = movieSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    posterUrl: formData.get("posterUrl"),
    durationMinutes: formData.get("durationMinutes"),
    rating: formData.get("rating"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Caller's own RLS-scoped client: movies_write_admin_only checks
  // is_platform_admin() at the database layer too, so this insert cannot
  // succeed for a non-admin even if requirePlatformAdmin() were bypassed.
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("movies")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      poster_url: parsed.data.posterUrl ?? null,
      duration_minutes: parsed.data.durationMinutes,
      rating: parsed.data.rating ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create movie. Please try again." };
  }

  await writeAuditLog({
    actorId: userId,
    action: "movie.created",
    entity: "movie",
    entityId: data.id,
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/dashboard/movies");
  return { ok: true, data: { movieId: data.id } };
}

export async function updateMovie(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { userId } = await requirePlatformAdmin();

  const parsed = updateMovieSchema.safeParse({
    movieId: formData.get("movieId"),
    title: formData.get("title"),
    description: formData.get("description"),
    posterUrl: formData.get("posterUrl"),
    durationMinutes: formData.get("durationMinutes"),
    rating: formData.get("rating"),
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
    .from("movies")
    .update({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      poster_url: parsed.data.posterUrl ?? null,
      duration_minutes: parsed.data.durationMinutes,
      rating: parsed.data.rating ?? null,
    })
    .eq("id", parsed.data.movieId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not update movie." };
  if (!data) return { ok: false, error: "Movie not found." };

  await writeAuditLog({
    actorId: userId,
    action: "movie.updated",
    entity: "movie",
    entityId: parsed.data.movieId,
  });

  revalidatePath("/dashboard/movies");
  return { ok: true };
}

/**
 * There is deliberately no `deleteMovie`. `showtimes.movie_id` references
 * `movies(id)` with `on delete restrict` (0001_core_schema.sql), and a
 * title already selected into one or more cinemas' catalogs via
 * `cinema_movies` (on delete cascade) would silently vanish from those
 * cinemas on delete — a destructive, cross-cinema side effect an admin
 * catalog action shouldn't have as an easy one-click option. If retiring a
 * title is needed later, model it as a status/visibility flag (additive
 * migration) rather than a hard delete.
 */
