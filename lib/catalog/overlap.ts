/**
 * Pure, DB-free showtime overlap checking for a single screen.
 *
 * This is an APP-LAYER SOFT GUARD, not a database-level constraint. Per
 * architecture-plan.md: a `btree_gist` exclusion constraint on
 * (screen_id, [starts_at, starts_at + duration)) is the authoritative,
 * concurrency-safe guard, but it's explicitly deferred to Phase 9
 * hardening. Until then, this function is what `lib/actions/showtimes.ts`
 * calls — after fetching the screen's existing showtimes through the
 * caller's own RLS-scoped client — to reject an obviously conflicting
 * showtime before insert. Two concurrent requests could still race past
 * this check (no DB constraint stops them), which is a known, accepted gap
 * until the Phase 9 exclusion constraint lands.
 *
 * A showtime "occupies" the screen from its start time through its
 * `duration_minutes` PLUS a fixed changeover buffer (cleaning, exiting
 * one audience, seating the next) — not just the raw movie runtime.
 */

export const SHOWTIME_BUFFER_MINUTES = 15;

export interface ShowtimeWindow {
  start: Date;
  end: Date;
}

export interface ExistingShowtimeForOverlapCheck {
  id: string;
  startsAt: Date;
  durationMinutes: number;
}

/**
 * Computes the [start, end) window a showtime occupies on its screen,
 * including the changeover buffer after the movie's runtime.
 */
export function computeShowtimeWindow(params: {
  startsAt: Date;
  durationMinutes: number;
  bufferMinutes?: number;
}): ShowtimeWindow {
  const bufferMinutes = params.bufferMinutes ?? SHOWTIME_BUFFER_MINUTES;
  const totalMinutes = params.durationMinutes + bufferMinutes;
  const start = params.startsAt;
  const end = new Date(start.getTime() + totalMinutes * 60 * 1000);
  return { start, end };
}

/** True if two half-open [start, end) windows intersect at all. */
export function windowsOverlap(a: ShowtimeWindow, b: ShowtimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Checks a candidate showtime (start time + movie duration) against a list
 * of existing showtimes already scheduled on the same screen. Returns the
 * first conflicting existing showtime's id, or null if there's no overlap.
 *
 * `excludeShowtimeId` lets an update-in-place skip comparing a showtime
 * against itself.
 */
export function findOverlappingShowtimeId(params: {
  candidateStartsAt: Date;
  candidateDurationMinutes: number;
  existingShowtimes: ExistingShowtimeForOverlapCheck[];
  excludeShowtimeId?: string;
  bufferMinutes?: number;
}): string | null {
  const candidateWindow = computeShowtimeWindow({
    startsAt: params.candidateStartsAt,
    durationMinutes: params.candidateDurationMinutes,
    bufferMinutes: params.bufferMinutes,
  });

  for (const existing of params.existingShowtimes) {
    if (params.excludeShowtimeId && existing.id === params.excludeShowtimeId) {
      continue;
    }
    const existingWindow = computeShowtimeWindow({
      startsAt: existing.startsAt,
      durationMinutes: existing.durationMinutes,
      bufferMinutes: params.bufferMinutes,
    });
    if (windowsOverlap(candidateWindow, existingWindow)) {
      return existing.id;
    }
  }

  return null;
}
