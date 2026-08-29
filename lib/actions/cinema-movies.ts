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
    // A movie still referenced by an existing showtime cannot be removed —
    // showtimes.movie_id has no FK to cinema_movies, but removing a title
    // out from under a scheduled showtime would silently orphan it from
    // the cinema's own catalog view. We don't have a DB constraint for
    // this yet, so this is intentionally left permissive at the DB layer;
    // the UI should warn before removal (see movies/movie-list.tsx).
    return { ok: false, error: "Could not remove movie. Please try again." };
  }
  if (!data) {
    return { ok: false, error: "Movie not found in this cinema's catalog." };
  }

  revalidatePath(`/dashboard/${cinemaId}/movies`);
  return { ok: true };
}
