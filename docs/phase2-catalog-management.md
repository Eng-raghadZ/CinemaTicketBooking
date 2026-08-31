# Phase 2 — Catalog Management

*Updated after the Phase 2 hardening pass — four review rounds: catalog
permission enforcement, column-level UPDATE scoping (including a follow-up
for the `id` column), a screen-delete cascade guard, and showtime INSERT
cross-table integrity, each with dedicated integration tests. See "Known
gap" and the "Column-level and cross-table integrity" section below for
what changed and why — the original documentation is preserved inline for
the record.*

This documents what Phase 2 adds on top of the verified Phase 0/1 baseline
(`docs/architecture-plan.md` v3, migrations `0001`–`0012`). Migrations
`0001`–`0012` were not modified. One new forward-only migration,
`0013_catalog_permission_enforcement.sql`, was added during hardening — see
"Known gap" below; everything else in this document describes the original
Phase 2 build, which is unchanged.

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
   cinema hasn't added). **As of the hardening pass, this is also
   independently enforced at the database layer** —
   `enforce_showtime_insert_integrity()`, see below — not just by this
   application-layer check.
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

**`removeCinemaMovie` does NOT retroactively clean up existing showtimes —
this is an accurate limitation, not an oversight to silently fix here.**
There is no FK from `showtimes` to `cinema_movies` (and none is proposed by
this hardening pass — that would be a schema change to `0001`/`0005`, out
of scope). `enforce_showtime_insert_integrity()` only checks
`(cinema_id, movie_id) IN cinema_movies` at the moment a showtime is
**inserted**. If a movie is later removed from a cinema's catalog via
`removeCinemaMovie` while a showtime for it is already scheduled, that
showtime is left exactly as-is — it does not get deleted, and nothing
currently re-validates it against the (now-changed) `cinema_movies` state.
This mirrors a documented gap already called out for that action itself
(`lib/actions/cinema-movies.ts`'s comment on `removeCinemaMovie`) and is
being surfaced here explicitly so this document doesn't imply stronger
referential integrity than actually exists. If this needs to change later
(e.g. block removal while a future showtime references the movie, or
cascade-cancel it), that's additive scope for a future phase, not this one.

### Column-level and cross-table integrity for `showtimes` (added after
review, in two further rounds)

Two things beyond simple row-level RLS turned out to need database-layer
enforcement, both closed by new `BEFORE` triggers in
`0013_catalog_permission_enforcement.sql` (not new RLS policies — RLS
can't express either of these):

1. **`enforce_showtime_update_scope()`** restricts `UPDATE` on `showtimes`
   to `base_price` only (see "Known gap" below for the full history,
   including why `id` itself had to be explicitly checked, not just the
   more obvious scheduling columns).
2. **`enforce_showtime_insert_integrity()`** — added in a later review
   round — independently verifies, at `INSERT` time, that `screen_id`
   actually belongs to `cinema_id`, that `(cinema_id, movie_id)` is really
   a row in `cinema_movies`, and that `currency_code` matches the cinema's
   own `currency_code`. Without this, `showtimes_insert_manage_showtimes`
   (RLS) only ever checked that the caller had `manage_showtimes` on the
   supplied `cinema_id` — a manager could otherwise `INSERT` directly
   against PostgREST with `cinema_id = Cinema A` but `screen_id` belonging
   to Cinema B (or any `movie_id`, or any `currency_code`), bypassing
   `createShowtime`'s own checks entirely by going around the Server
   Action. Scoped to `INSERT` only: `enforce_showtime_update_scope()`
   already makes those same columns immutable after insert for every
   non-admin caller, so a row valid at insert time can't later drift
   invalid through an `UPDATE` this schema allows.

3. **`enforce_screen_delete_scope()`** — a third trigger, on `screens` this
   time, closing an unrelated but adjacent finding: `showtimes.screen_id`
   references `screens(id)` `ON DELETE CASCADE`
   (`0001_core_schema.sql`, unedited), and `manage_screens` alone grants
   `DELETE` on `screens`. Without this trigger, a manager holding **only**
   `manage_screens` could delete a screen that has real showtimes scheduled
   on it, and Postgres would cascade-delete those showtimes as ordinary FK
   housekeeping — an indirect showtime deletion with none of the
   `manage_showtimes` authorization this hardening pass exists to require.
   The trigger blocks deleting a screen with any referencing showtimes for
   everyone except `platform_admin`/service-role (owners included — see
   "Known gap" below for why the column-scope trigger already applies to
   owners too, same reasoning here); a screen with zero showtimes —
   including a newly created one whose seat-batch insert just failed —
   still deletes cleanly, which is what `createScreen`'s compensating
   delete needs.

## Known gap — flagged, not silently resolved either way

**Status: RESOLVED** by `supabase/migrations/0013_catalog_permission_enforcement.sql`
and the corresponding application-layer changes below (Phase 2 hardening
pass). The gap as originally documented is preserved verbatim beneath the
resolution for the record.

### How catalog permissions are now enforced

Every catalog write is now gated by the *specific* permission key it
requires, at both layers, not just the coarse owner/manager role tier:

| Operation | Required permission | RLS policy | Column scope | App-layer guard |
|---|---|---|---|---|
| Create/delete a screen; insert seats | `manage_screens` | `screens_write_manage_screens`, `seats_write_manage_screens` | (whole row) | `requireCinemaCatalogPermission(cinemaId, "manage_screens")` |
| Create/delete a showtime | `manage_showtimes` | `showtimes_insert_manage_showtimes`, `showtimes_delete_manage_showtimes` | (whole row) | `requireCinemaCatalogPermission(cinemaId, "manage_showtimes")` |
| Change a showtime's price | `manage_pricing` | `showtimes_update_manage_pricing` | **`base_price` only** — enforced by the `showtimes_enforce_update_scope` trigger, see below | `requireCinemaCatalogPermission(cinemaId, "manage_pricing")` |
| Add/remove a movie from a cinema's catalog | *(unchanged — role tier only)* | `cinema_movies_write` | (whole row) | `requireCinemaStaff(cinemaId, { minRole: "manager" })` |

An **owner** always passes every check above unconditionally — the
`permissions` jsonb is never consulted for an owner, matching the pattern
`can_manage_cinema_staff` already established for `manage_staff` in Phase 1.
A **manager** must have the exact key explicitly set to `true`; holding one
catalog permission grants nothing beyond it — confirmed by dedicated
integration tests (see below).

**RLS row-scoping is not the whole story for showtime UPDATE.** RLS decides
*which row* a `manage_pricing` manager may touch, but Postgres RLS has no
mechanism to restrict *which columns* change within an allowed row. A first
pass of this migration left that open: a manager holding only
`manage_pricing` could pass `showtimes_update_manage_pricing`'s USING/WITH
CHECK (both only inspect `cinema_id`) and then issue
`UPDATE showtimes SET starts_at = ..., screen_id = ..., movie_id = ...` on
their own cinema's showtime — a full reschedule, despite never holding
`manage_showtimes`. This was caught in review before sign-off and closed
with a `BEFORE UPDATE` trigger, `enforce_showtime_update_scope()`, added to
the same migration — see below.

**Reused, not duplicated:** the SQL side adds exactly one new generic helper,
`can_manage_catalog(cinema_id, permission_key)`, called three times with
different key literals — mirroring, and generalizing,
`can_manage_cinema_staff`'s existing "owner OR manager-with-key" shape
rather than re-implementing it per key. The TypeScript side adds one
generic function, `hasCinemaPermission(membership, key)`
(`lib/auth/permissions.ts`); `canManageCinemaStaff` is now defined in terms
of it (`hasCinemaPermission(membership, "manage_staff")`) instead of
duplicating the interpretation. One new guard,
`requireCinemaCatalogPermission(cinemaId, key)` (`lib/auth/guards.ts`),
wraps the fetch-membership-then-check pattern already used inline in
`lib/actions/staff.ts`, so `lib/actions/screens.ts` and
`lib/actions/showtimes.ts` call one function instead of three copies of the
same Supabase query. The column-level guard itself reuses an existing
*pattern* rather than a function: it's the same `BEFORE UPDATE`
NEW-vs-OLD-comparison idiom `0004_status_transition_guards.sql` already
established for exactly this class of problem
(`enforce_cinema_status_change_admin_only`, `enforce_booking_update_scope`)
— not a new mechanism introduced for this one case.

`cinema_movies` was deliberately left on the coarse owner/manager check —
there is no `manage_movies`/`manage_catalog` key in `STAFF_PERMISSION_KEYS`,
and the hardening task that produced this migration explicitly scoped "At
minimum" to screens, showtimes, and pricing. If per-key enforcement for
cinema_movies is wanted later, it needs a new permission key added to the
vocabulary first (validation, RLS, docs, tests all updated together) —
tracked as a legitimate remaining limitation, not silently done here.

### New migration: `0013_catalog_permission_enforcement.sql`

Forward-only, does not edit any of `0001`–`0012`. Six things, in order:

1. **A GRANT fix**, discovered while writing this migration's own
   integration tests, not a previously-known-and-worked-around issue:
   `authenticated` had never been granted `DELETE` on `showtimes`,
   `cinema_movies`, or `screens` at all (`0007_roles_and_grants.sql` only
   ever granted SELECT/INSERT/UPDATE on them). Since a GRANT is checked
   *before* RLS, this meant `deleteShowtime`, `removeCinemaMovie`, and
   `createScreen`'s best-effort compensating delete-on-seat-failure had
   never actually worked for **any** caller going through the
   `authenticated` role — including an owner or platform_admin, since every
   Server Action in this app uses the caller's own session client, not
   `service_role`. Fixed with a single narrowly-scoped
   `grant delete on showtimes, cinema_movies, screens to authenticated;`.
2. **`can_manage_catalog(cinema_id, permission_key)`** — the generic
   SECURITY DEFINER helper described above.
3. **Policy replacements** — `screens_write_owner_manager` and
   `seats_write_owner_manager` are dropped and replaced with
   `*_manage_screens` equivalents; `showtimes_write` (a single `for all`
   policy) is dropped and replaced with three command-scoped policies
   (`showtimes_insert_manage_showtimes`, `showtimes_delete_manage_showtimes`,
   `showtimes_update_manage_pricing`) so scheduling and pricing can require
   different keys. `cinema_movies_write` is untouched.
4. **`enforce_showtime_update_scope()`** — a `BEFORE UPDATE` trigger on
   `showtimes` that rejects any UPDATE changing `id`, `cinema_id`,
   `screen_id`, `movie_id`, `starts_at`, `currency_code`, or `created_at` —
   every column on the table except `base_price` — for any caller except
   `platform_admin` or a trusted service-role connection
   (`auth.uid() IS NULL`) — the same bypass condition every existing 0004
   trigger uses. `id` (the primary key) is checked explicitly, not just the
   more obvious scheduling columns: a first pass of this trigger omitted
   it, which was caught in review since it's a column like any other and
   nothing stops a caller from attempting `SET id = ...` directly. This
   applies to **owners as well as managers**: Phase 2 doesn't expose full
   showtime rescheduling to anyone at the application layer, so the
   database doesn't allow it via a raw UPDATE either, regardless of role.
   Column-level `REVOKE`/`GRANT` privileges were considered and rejected —
   Postgres column privileges can't be made conditional on the
   `manage_pricing` jsonb key the way a trigger can, so they'd either block
   the column for everyone or no one at the SQL-grant level; a trigger is
   the only mechanism in this architecture capable of expressing "this
   column, only if this specific permission is held."
5. **`enforce_screen_delete_scope()`** — a `BEFORE DELETE` trigger on
   `screens`, added in a third review round after `screens_write_
   manage_screens` (item 3) was found to grant an indirect path to
   showtime deletion: `showtimes.screen_id references screens(id) ON
   DELETE CASCADE` (`0001_core_schema.sql`, unedited), so a manager holding
   only `manage_screens` could delete a screen with real showtimes
   scheduled on it and let Postgres cascade-delete those showtimes as
   ordinary FK housekeeping — achieving a showtime deletion without ever
   holding `manage_showtimes`. The trigger blocks deleting any screen that
   still has `showtimes` referencing it, for every non-admin/non-service
   caller (owners included, same reasoning as item 4); a screen with zero
   referencing showtimes — including a brand-new one whose seat-batch
   insert just failed — still deletes cleanly, which is exactly what
   `createScreen`'s compensating delete needs. Fires *before* the DELETE
   (and therefore before any cascade), so it can abort the whole statement
   without any change to the FK definition itself.
6. **`enforce_showtime_insert_integrity()`** — a `BEFORE INSERT` trigger on
   `showtimes`, added in the same review round after
   `showtimes_insert_manage_showtimes` (item 3) was found to authorize an
   INSERT based solely on the supplied `cinema_id` having
   `manage_showtimes` granted — never independently confirming that
   `screen_id` actually belongs to that `cinema_id`, that
   `(cinema_id, movie_id)` is really a row in `cinema_movies`, or that
   `currency_code` matches the cinema's own `currency_code`.
   `lib/actions/showtimes.ts`'s `createShowtime` already checks all three
   before inserting, but a direct PostgREST INSERT bypassing the Server
   Action entirely would previously not have been caught by RLS alone.
   `currency_code` is checked for the same reason `createShowtime` never
   accepts it from the client in the first place — architecture-plan.md's
   explicit prior decision that currency is always server-derived, now
   enforced at the database layer too. Scoped to INSERT only: item 4
   already makes these same columns immutable after insert for every
   non-admin caller, so a row valid at insert time can't later drift
   invalid through an UPDATE. Bypassed for `platform_admin`/service-role,
   consistent with every other trigger here.

### Integration coverage added

`tests/integration/catalog-permissions-rls.test.ts` — new, self-contained
file (own fixtures, own IDs), **64 tests**, exercised entirely through real
Postgres/RLS via the existing `asUser` helper (never a service-role
bypass), covering exactly what the hardening pass required:

- **Cross-cinema isolation**: a manager with *every* catalog permission on
  Cinema A is denied on Cinema B for screens, seats, showtimes (insert,
  update, delete), and cinema_movies.
- **Per-permission enforcement**: for each of `manage_screens`,
  `manage_showtimes`, `manage_pricing` — a manager holding it can perform
  the matching operation on their own cinema; a manager without it (either
  holding no catalog permissions, or holding a *different* one) cannot.
- **Permission separation**: four dedicated tests proving
  `manage_showtimes` doesn't imply `manage_pricing` or `manage_screens`,
  `manage_pricing` doesn't imply `manage_screens`, `manage_screens` doesn't
  imply `manage_showtimes`, and a manager holding all three can do all
  three.
- **Column-level guard (added after review, extended after a second
  review)**: nine tests proving a `manage_pricing`-only manager CAN update
  `base_price` but CANNOT change `starts_at`, `screen_id` (including to
  another screen on their *own* cinema, not just cross-cinema), `movie_id`,
  or `id` itself — individually or combined with an otherwise-valid price
  change in the same statement (the whole UPDATE must roll back, not
  partially apply). Plus four tests confirming the guard applies to owners
  too (no rescheduling for anyone, including `id`) while
  `platform_admin` correctly bypasses it.
- **Screen-delete cascade guard (added after a third review)**: seven
  tests proving a `manage_screens`-only manager CAN delete an empty screen
  (required for compensation) but CANNOT delete a screen with a showtime
  scheduled on it — even holding *every* catalog permission at once — with
  the showtime confirmed to survive the rejected deletion; that the
  correct sequence (delete the showtime via `manage_showtimes`, then the
  now-empty screen via `manage_screens`) works; that owners are equally
  blocked; and that `platform_admin` bypasses the guard (cascading the
  showtime), consistent with its bypass everywhere else.
- **Showtime INSERT cross-table integrity (added after the same third
  review)**: seven tests proving a manager with `manage_showtimes` on
  Cinema A cannot INSERT a showtime using a screen belonging to Cinema B
  (and that the failed attempt leaves no row behind), cannot schedule a
  movie not in that cinema's `cinema_movies`, cannot use a `currency_code`
  that doesn't match the cinema's own; that a fully valid combination
  still succeeds; and that `platform_admin` bypasses all three checks at
  once.
- **Owner behavior**: an owner with an empty `permissions: {}` (the normal
  state — see `0008_cinema_owner_bootstrap.sql`) still has full
  screen/showtime/pricing access on their own cinema, and is still denied
  on a cinema they don't own.
- **Master movie catalog**: platform admin can create/update movies; a
  cinema owner cannot; a manager holding **every** catalog permission still
  cannot — the explicit check that `manage_screens`/`manage_showtimes`/
  `manage_pricing` never leak into `movies_write_admin_only`.
- Two tests specifically proving the GRANT fix itself: a permitted manager
  can now actually `DELETE` a screen, and an owner/manager can now actually
  `DELETE` a `cinema_movies` row.

`tests/unit/permissions.test.ts` also gained 11 new tests for the generic
`hasCinemaPermission` helper (independent of any database), including the
same permission-separation assertions at the pure-function level.

### Previously documented gap (for the record)

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
- ✅ **(Resolved by hardening pass)** Catalog writes are now gated by the
  specific permission key they require (`manage_screens`,
  `manage_showtimes`, `manage_pricing`), enforced identically at the
  Server Action layer and RLS — see "Known gap" above.
- ✅ **(Resolved by hardening pass)** Dedicated RLS-level integration
  tests for screens/seats/showtimes now exist
  (`tests/integration/catalog-permissions-rls.test.ts`, 64 tests) —
  previously only `movies`/`cinema_movies` write restrictions had coverage
  via Phase 0's fixture file.

## Deliberately deferred to later phases

- Public browsing of catalog/showtimes → Phase 3
- Realtime seat map reading the generated `seats` rows → Phase 4
- Per-key enforcement for `cinema_movies` (no `manage_movies`/
  `manage_catalog` key exists yet in `STAFF_PERMISSION_KEYS`) → would need
  a new permission key added to the vocabulary first, tracked as a
  legitimate remaining limitation
- `btree_gist` exclusion constraint for showtime overlap → Phase 9
  hardening (already tracked in architecture-plan.md)

## Remaining Phase 2 limitations (post-hardening)

- Showtime editing is still price-only (deliberate, unchanged) — now
  enforced at the column level by `enforce_showtime_update_scope()`, not
  just by what the application happens to send.
- `cinema_movies` writes remain gated by role tier only, not a specific
  permission key (see above — no key exists for it yet).
- **`removeCinemaMovie` does not retroactively affect existing showtimes.**
  There is no FK from `showtimes` to `cinema_movies`, and
  `enforce_showtime_insert_integrity()` only validates catalog membership
  at `INSERT` time, not on an ongoing basis. Removing a movie from a
  cinema's catalog while a showtime for it already exists leaves that
  showtime untouched — not blocked, not cascaded, not flagged. This is a
  genuine, currently-accepted gap, not just a documentation nuance;
  flagged explicitly (rather than left implicit) so this document doesn't
  overstate the referential integrity that actually exists. See
  `lib/actions/cinema-movies.ts`'s `removeCinemaMovie` comment for the
  same note in the code itself.
- The screen+seat-grid creation is still not atomic at the database level
  (two separate PostgREST calls with a best-effort compensating delete on
  failure) — the compensating delete itself is now confirmed to actually
  work (the GRANT fix in `0013` was required for that), but the underlying
  two-step-not-atomic design is unchanged. A `SECURITY DEFINER` Postgres
  function remains the Phase 9 hardening candidate if this proves to be a
  real problem in practice.
- The showtime overlap check remains an app-layer soft guard, not a DB
  constraint — unchanged, tracked for Phase 9.
- No test exercises concurrent/racing catalog writes (e.g. two managers
  simultaneously creating showtimes that would overlap) — the existing
  `findOverlappingShowtimeId` unit tests and this phase's new RLS tests are
  both sequential-request tests.
