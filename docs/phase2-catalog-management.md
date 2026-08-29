# Phase 2 — Catalog Management

This documents what Phase 2 adds on top of the verified Phase 0/1 baseline
(`docs/architecture-plan.md` v3, migrations `0001`–`0012`). No migrations,
RLS policies, or triggers were added or modified — the database foundation
for movies, screens, seats, cinema_movies, and showtimes was already fully
present and RLS-protected from Phase 0/0001 and 0005. Phase 2 is entirely
the missing **application layer** on top of that.

## What already existed from Phase 0/1 (not re-touched)

- `movies`, `cinema_movies`, `screens`, `seats`, `showtimes` tables
  (`0001_core_schema.sql`)
- RLS: `movies_write_admin_only`, `cinema_movies_write`,
  `screens_write_owner_manager`, `seats_write_owner_manager`,
  `showtimes_write` (`0005_rls_policies.sql`) — all already scoped exactly
  the way this phase's Server Actions assume
- `requireCinemaStaff(cinemaId, { minRole })` and `requirePlatformAdmin()`
  guards (`lib/auth/guards.ts`)
- `hasMinCinemaStaffRole` / `canManageCinemaStaff` pure permission helpers
  (`lib/auth/permissions.ts`)

## What Phase 2 adds

| Area | Files |
|---|---|
| Pure logic (DB-free, unit-tested) | `lib/catalog/seat-layout.ts`, `lib/catalog/overlap.ts` |
| Validation | `lib/validation/catalog.ts` |
| Server Actions | `lib/actions/movies.ts`, `lib/actions/cinema-movies.ts`, `lib/actions/screens.ts`, `lib/actions/showtimes.ts` |
| Admin UI | `app/(admin)/dashboard/movies/*` |
| Cinema-side UI | `app/(owner-staff)/dashboard/[cinemaId]/movies/*`, `.../screens/*`, `.../showtimes/*` |
| Nav wiring | `app/(owner-staff)/dashboard/[cinemaId]/page.tsx`, `app/(admin)/dashboard/cinemas/page.tsx` |
| Tests | `tests/unit/seat-layout.test.ts`, `tests/unit/overlap.test.ts`, `tests/unit/validation-catalog.test.ts` |

### Master movie catalog (admin-only)

`createMovie` / `updateMovie` run through `requirePlatformAdmin()` (layer 2)
and the caller's own RLS-scoped client, so `movies_write_admin_only`
(layer 3) is the final backstop — same defense-in-depth pattern as Phase 1's
cinema approval flow. There is **deliberately no `deleteMovie`**: a hard
delete would cascade through `cinema_movies` (`on delete cascade`) and
silently remove the title from every cinema that had selected it, and
`showtimes.movie_id` references `movies(id)` `on delete restrict` anyway.
Retiring a title is left for a future additive change (a status/visibility
flag), not this phase.

### Cinema movie selection (`cinema_movies`)

`addCinemaMovie` / `removeCinemaMovie` are the *only* catalog write path
available to a cinema owner/manager — they can never reach `movies`
directly, enforced identically at the RLS layer. Authorized via
`requireCinemaStaff(cinemaId, { minRole: "manager" })`, which matches
`cinema_movies_write`'s `cinema_staff_role_for(...) IN ('owner','manager')`
check exactly.

### Screens & seat-grid generation

`createScreen` generates a full uniform seat grid in one step via
`lib/catalog/seat-layout.ts`: spreadsheet-style row labels (A..Z, AA, AB...)
so a screen can exceed 26 rows without special-casing, `rows × seatsPerRow`
seats of one `seatType`, capped well below any realistic screen size as a
sanity check. The generation *inputs* — not the derived seat list — are
persisted in `screens.layout_config` jsonb, matching the architecture
note that this column exists so a richer layout can be added later without
a migration.

**Not atomic at the DB level.** The screen insert and the seat-batch insert
are two separate PostgREST calls through the caller's RLS-scoped client (no
multi-statement transaction is available that way). If the seat insert
fails, the action makes a best-effort compensating delete of the screen row
so a caller doesn't end up with a silently seatless screen. A fully atomic
version would need a `SECURITY DEFINER` Postgres function — flagged as a
reasonable Phase 9 hardening candidate, not built here.

### Showtimes

`createShowtime`:
1. Reads `cinema.currency_code` **server-side** and copies it onto the
   showtime — the client never supplies a currency, per prior decision.
2. Verifies the screen belongs to the cinema and the movie is actually in
   that cinema's `cinema_movies` selection (can't schedule a title the
   cinema hasn't added).
3. Runs `findOverlappingShowtimeId` (an app-layer soft guard) against the
   screen's existing showtimes, using each movie's `duration_minutes` plus
   a fixed 15-minute changeover buffer, before inserting.

`updateShowtimePrice` only changes `base_price` — changing the start time,
screen, or movie would require re-running the overlap check and is left as
a follow-up rather than folded into this action.

`deleteShowtime` relies on `bookings.showtime_id … on delete restrict`
(already in `0001_core_schema.sql`) as the real backstop once Phase 4
bookings exist; today it will simply always succeed since no bookings table
rows reference showtimes yet.

## Known gap — flagged, not silently resolved either way

`STAFF_PERMISSION_KEYS` (Phase 1, `lib/validation/staff.ts`) includes
`manage_showtimes`, `manage_pricing`, and `manage_screens` as documented
permission keys. **None of them are wired into any RLS predicate or
app-layer check for catalog writes.** The actual RLS policies
(`cinema_movies_write`, `screens_write_owner_manager`, `showtimes_write`)
only check the coarse `cinema_staff_role_for(...) IN ('owner','manager')`
role tier — the same check `can_manage_cinema_staff` uses for the fine-grained
`manage_staff` permission is *not* mirrored for these other keys anywhere in
the current schema.

This phase deliberately did **not** invent app-layer-only enforcement of
those keys (that would create a mismatch with what RLS actually allows — a
manager blocked by the UI could still write directly against a
manager-permitted RLS policy), and it deliberately did **not** modify
Phase 0/1's verified RLS migrations without sign-off. Net effect: **any
active manager currently has full movies/screens/showtimes write access
for their cinema**, regardless of which specific permission checkboxes were
selected at invite time. If per-key enforcement for these three keys is
wanted, it needs a reviewed migration (new RLS predicates referencing
`permissions->>'manage_showtimes'` etc., mirroring `can_manage_cinema_staff`)
plus corresponding layer-2 checks — a good candidate for its own small,
explicitly-scoped change rather than something to bundle silently into
Phase 2.

## Exit criteria check (architecture-plan.md v3, Phase 2)

- ✅ Admin-only master movie catalog CRUD (create/update; delete
  intentionally omitted, see above).
- ✅ Cinema-to-movie association management.
- ✅ Screen creation and safe seat-grid/layout generation, including
  screens exceeding 26 rows.
- ✅ Showtime creation and removal, with app-layer conflict checking.
- ⚠️ Showtime *editing* is price-only, not full re-scheduling — documented
  above as a deliberate scope boundary, not an oversight.
- ✅ Validation, authorization (layers 2 & 3), and unit tests for all new
  pure logic and schemas.
- ⏸ Integration tests (RLS-level) for the new tables were not added in
  this pass — `tests/integration/rls-and-constraints.test.ts` already
  exercises `movies`/`cinema_movies` write restrictions from Phase 0's
  fixtures, but screens/seats/showtimes RLS paths have no dedicated
  integration coverage yet. Recommended before sign-off.

## Deliberately deferred to later phases

- Public browsing of catalog/showtimes → Phase 3
- Realtime seat map reading the generated `seats` rows → Phase 4
- Per-permission-key (`manage_showtimes`/`manage_pricing`/`manage_screens`)
  enforcement → follow-up change, see "Known gap" above
- `btree_gist` exclusion constraint for showtime overlap → Phase 9
  hardening (already tracked in architecture-plan.md)
