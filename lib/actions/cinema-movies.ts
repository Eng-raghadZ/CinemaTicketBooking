"use server";

/**
 * A cinema's selection of existing catalog titles (`cinema_movies`).
 * Cinema owners/managers may only ADD/REMOVE rows here — they never write
 * to `movies` directly (see lib/actions/movies.ts). Authorization mirrors
 * the RLS policy in supabase/migrations/0005_rls_policies.sql
 * (cinema_movies_write: is_platform_admin() OR
 * cinema_staff_role_for(cinema_id) IN ('owner','manager')), enforced here
 * at layer 2 via requireCinemaStaff({ minRole: "manager" }).
 */
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { requireCinemaStaff } from "@/lib/auth/guards";
import { cinemaMovieSchema } from "@/lib/validation/catalog";
import type { ActionResult } from "./cinemas";

export async function addCinemaMovie(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cinemaMovieSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    movieId: formData.get("movieId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please select a movie." };
  }
  const { cinemaId, movieId } = parsed.data;

  // manager rank includes owner (roleRank: staff=0, manager=1, owner=2) —
  // matches the RLS policy's owner/manager requirement exactly.
  const { userId } = await requireCinemaStaff(cinemaId, { minRole: "manager" });

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("cinema_movies").insert({
    cinema_id: cinemaId,
    movie_id: movieId,
    added_by: userId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This movie is already in your catalog." };
    }
    return { ok: false, error: "Could not add movie. Please try again." };
  }

  revalidatePath(`/dashboard/${cinemaId}/movies`);
  return { ok: true };
}

export async function removeCinemaMovie(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = cinemaMovieSchema.safeParse({
    cinemaId: formData.get("cinemaId"),
    movieId: formData.get("movieId"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }
  const { cinemaId, movieId } = parsed.data;

  await requireCinemaStaff(cinemaId, { minRole: "manager" });

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinema_movies")
    .delete()
    .eq("cinema_id", cinemaId)
    .eq("movie_id", movieId)
    .select("movie_id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: "Could not remove movie. Please try again." };
  }
  if (!data) {
    return { ok: false, error: "Movie not found in this cinema's catalog." };
  }

  // Deliberately NOT re-checked against showtimes: there is no FK from
  // showtimes to cinema_movies, and this migration's
  // enforce_showtime_insert_integrity() (0013) only validates
  // (cinema_id, movie_id) membership at the moment a showtime is inserted,
  // not on an ongoing basis. So this DELETE always succeeds once the
  // caller is authorized and the row exists — even if a showtime already
  // scheduled for this movie still exists. That showtime is left exactly
  // as-is; nothing here or in the database currently detects or prevents
  // that. See docs/phase2-catalog-management.md, "removeCinemaMovie does
  // NOT retroactively clean up existing showtimes" for the full reasoning
  // and why this is being left as a documented limitation rather than
  // silently redesigned in this hardening pass.

  revalidatePath(`/dashboard/${cinemaId}/movies`);
  return { ok: true };
}
