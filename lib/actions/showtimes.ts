"use server";

/**
 * Showtime creation/editing/removal. Authorization mirrors the split
 * showtimes_insert_manage_showtimes / showtimes_delete_manage_showtimes /
 * showtimes_update_manage_pricing RLS policies
 * (supabase/migrations/0013_catalog_permission_enforcement.sql): owner, or
 * manager with the specific permission for that operation — scheduling
 * (manage_showtimes) and pricing (manage_pricing) are deliberately separate
 * keys, neither implying the other. Three things this module is careful
 * about, because they were explicit prior decisions rather than obvious
 * defaults:
 *
 * 1. currency_code is NEVER accepted from the client — it's always read
 *    server-side from the cinema record and copied onto the showtime.
 * 2. Overlap checking is an APP-LAYER SOFT GUARD (lib/catalog/overlap.ts),
 *    not a DB constraint — see that file's header for why, and the known
 *    race-condition gap that implies until Phase 9 hardening.
 * 3. Scheduling (create/delete) and pricing (update) require different
 *    permission keys — see requireCinemaCatalogPermission calls below.
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { requireCinemaCatalogPermission } from "@/lib/auth/guards";
import {
  createShowtimeSchema,
  showtimeIdSchema,
  updateShowtimePriceSchema,
} from "@/lib/validation/catalog";
import { findOverlappingShowtimeId } from "@/lib/catalog/overlap";
import type { ActionResult } from "./cinemas";

export async function createShowtime(
  _prev: ActionResult<{ showtimeId: string }>,
  formData: FormData,
): Promise<ActionResult<{ showtimeId: string }>> {
  const parsed = createShowtimeSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    screenId: formData.get("screenId"),
    movieId: formData.get("movieId"),
    startsAt: formData.get("startsAt"),
    basePrice: formData.get("basePrice"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { cinemaId, screenId, movieId, startsAt, basePrice } = parsed.data;

  // Owner, or manager explicitly granted 'manage_showtimes' — scheduling is
  // a distinct permission from pricing (updateShowtimePrice below) and
  // neither implies the other. See
  // supabase/migrations/0013_catalog_permission_enforcement.sql.
  await requireCinemaCatalogPermission(cinemaId, "manage_showtimes");

  const supabase = await createServerSupabaseClient();

  // Currency is read server-side from the cinema record — never trusted
  // from the client — and the screen/movie relationships are verified in
  // the same round trip rather than assumed from the form payload.
  const [{ data: cinema, error: cinemaError }, { data: screen, error: screenError }, { data: cinemaMovie, error: cinemaMovieError }] =
    await Promise.all([
      supabase.from("cinemas").select("currency_code").eq("id", cinemaId).maybeSingle(),
      supabase.from("screens").select("id, cinema_id").eq("id", screenId).maybeSingle(),
      supabase
        .from("cinema_movies")
        .select("movie_id, movies:movie_id(duration_minutes)")
        .eq("cinema_id", cinemaId)
        .eq("movie_id", movieId)
        .maybeSingle(),
    ]);

  if (cinemaError || !cinema) {
    return { ok: false, error: "Cinema not found." };
  }
  if (screenError || !screen || screen.cinema_id !== cinemaId) {
    return { ok: false, error: "Screen not found for this cinema." };
  }
  if (cinemaMovieError || !cinemaMovie) {
    return {
      ok: false,
      error: "This movie is not in your cinema's catalog yet. Add it under Movies first.",
    };
  }

  const movieDurationMinutes = (
    cinemaMovie as unknown as { movies: { duration_minutes: number } | null }
  ).movies?.duration_minutes;

  if (!movieDurationMinutes) {
    return { ok: false, error: "Could not determine the movie's runtime." };
  }

  const { data: existingShowtimes, error: existingError } = await supabase
    .from("showtimes")
    .select("id, starts_at, movies:movie_id(duration_minutes)")
    .eq("screen_id", screenId);

  if (existingError) {
    return { ok: false, error: "Could not check for scheduling conflicts. Please try again." };
  }

  const conflictId = findOverlappingShowtimeId({
    candidateStartsAt: startsAt,
    candidateDurationMinutes: movieDurationMinutes,
    existingShowtimes: (existingShowtimes ?? []).map((row) => {
      const r = row as unknown as { id: string; starts_at: string; movies: { duration_minutes: number } | null };
      return {
        id: r.id,
        startsAt: new Date(r.starts_at),
        durationMinutes: r.movies?.duration_minutes ?? 0,
      };
    }),
  });

  if (conflictId) {
    return {
      ok: false,
      error:
        "This time conflicts with another showtime already scheduled on this screen (including changeover time).",
    };
  }

  const { data: showtime, error: insertError } = await supabase
    .from("showtimes")
    .insert({
      cinema_id: cinemaId,
      screen_id: screenId,
      movie_id: movieId,
      starts_at: startsAt.toISOString(),
      base_price: basePrice,
      currency_code: cinema.currency_code,
    })
    .select("id")
    .single();

  if (insertError || !showtime) {
    return { ok: false, error: "Could not create showtime. Please try again." };
  }

  revalidatePath(`/dashboard/${cinemaId}/showtimes`);
  return { ok: true, data: { showtimeId: showtime.id } };
}

/**
 * Price-only edit. Deliberately does NOT allow changing starts_at, screen,
 * or movie here — those would require re-running the overlap check and are
 * left as a follow-up rather than folded into this action's scope.
 */
export async function updateShowtimePrice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateShowtimePriceSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    showtimeId: formData.get("showtimeId"),
    basePrice: formData.get("basePrice"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { cinemaId, showtimeId, basePrice } = parsed.data;

  // Owner, or manager explicitly granted 'manage_pricing' — deliberately a
  // different permission than the one createShowtime/deleteShowtime require,
  // so a manager who can only adjust price cannot also add/remove
  // showtimes, and vice versa.
  await requireCinemaCatalogPermission(cinemaId, "manage_pricing");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("showtimes")
    .update({ base_price: basePrice })
    .eq("id", showtimeId)
    .eq("cinema_id", cinemaId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: "Could not update price." };
  if (!data) return { ok: false, error: "Showtime not found for this cinema." };

  revalidatePath(`/dashboard/${cinemaId}/showtimes`);
  return { ok: true };
}

export async function deleteShowtime(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = showtimeIdSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    showtimeId: formData.get("showtimeId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cinemaId, showtimeId } = parsed.data;

  // Same permission as scheduling — deleting a showtime is a scheduling
  // operation, not a pricing one.
  await requireCinemaCatalogPermission(cinemaId, "manage_showtimes");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("showtimes")
    .delete()
    .eq("id", showtimeId)
    .eq("cinema_id", cinemaId)
    .select("id")
    .maybeSingle();

  if (error) {
    // bookings.showtime_id references showtimes(id) on delete restrict
    // (0001_core_schema.sql) — once Phase 4 bookings exist, deleting a
    // showtime with real bookings against it will correctly fail here
    // rather than silently orphaning a customer's ticket.
    return {
      ok: false,
      error: "Could not delete showtime. It may already have bookings against it.",
    };
  }
  if (!data) return { ok: false, error: "Showtime not found for this cinema." };

  revalidatePath(`/dashboard/${cinemaId}/showtimes`);
  return { ok: true };
}
