# Phase 3 — Customer Browsing

This documents what Phase 3 adds on top of the verified Phase 0–2 baseline
(`docs/architecture-plan.md` v3, migrations `0001`–`0013`). No existing
migration was modified, and **no new migration was required at all** — see
"Why no migration was needed" below.

## What already existed from Phase 0–2 (not re-touched)

- `cinemas_select_public_approved`, `movies_select_public`,
  `cinema_movies_select`, `screens_select_public`, `showtimes_select` RLS
  policies (`0005_rls_policies.sql`)
- `anon` grants on `cinemas, screens, seats, movies, cinema_movies,
  showtimes, cinema_cancellation_policies` (`0007_roles_and_grants.sql`)
- `createServerSupabaseClient` (`lib/auth/server.ts`) — the same
  session-bound, RLS-respecting client every other Server Component in the
  app already uses

## Why no migration was needed

Every data-visibility rule Phase 3 requires was already enforced by
existing RLS policies before this phase started:

| Requirement | Enforced by (pre-existing) |
|---|---|
| Only approved cinemas are publicly visible | `cinemas_select_public_approved` (`status = 'approved'`) |
| Only movies/showtimes tied to an approved cinema are visible | `cinema_movies_select` / `showtimes_select` (`exists (... c.status = 'approved') OR is_active_cinema_staff(...) OR is_platform_admin()`) — an anonymous caller never satisfies the staff/admin branches, so only the approved-cinema branch applies |
| Staff records, permissions, audit logs, other users' data stay private | No `SELECT` policy (or no grant) exists for `anon`/unauthenticated `authenticated` on `cinema_staff`, `audit_logs`, `users`, `bookings`, etc. — default-deny |
| Public browsing is read-only | `anon` was only ever granted `SELECT` (`0007_roles_and_grants.sql`) — no `INSERT`/`UPDATE`/`DELETE` grant exists for `anon` on any table |

This was verified directly against real Postgres, not just read from the
SQL — see `tests/integration/public-browsing-rls.test.ts`.

## What Phase 3 adds

| Area | Files |
|---|---|
| Pure logic (DB-free, unit-tested) | `lib/catalog/browse-query.ts` |
| Public routes | `app/(public)/layout.tsx`, `app/(public)/cinemas/page.tsx`, `app/(public)/cinemas/[cinemaId]/page.tsx`, `app/(public)/movies/page.tsx`, `app/(public)/movies/[movieId]/page.tsx`, `app/(public)/showtimes/page.tsx`, `app/(public)/showtimes/[showtimeId]/page.tsx`, `app/(public)/booking-unavailable/page.tsx` |
| Home page | `app/page.tsx` (nav links added only — no redesign) |
| Tests | `tests/unit/browse-query.test.ts`, `tests/integration/public-browsing-rls.test.ts` |

None of these routes fall under `middleware.ts`'s `PROTECTED_PREFIXES`
(`/account`, `/bookings`, `/dashboard`), so they're reachable without a
session, as required. No route here uses the service-role client
(`lib/db/client.ts`'s `serviceDb()`) — every query goes through the
caller's own session-bound Supabase client, exactly like the rest of the
app.

## Routes

- **`/cinemas`** — paginated list of approved cinemas, searchable by name.
- **`/cinemas/[cinemaId]`** — a single approved cinema's details: the
  movies it currently offers (`cinema_movies`) and its upcoming showtimes,
  optionally filtered to one calendar date.
- **`/movies`** — paginated list of movies currently offered by at least
  one approved cinema, searchable by title.
- **`/movies/[movieId]`** — a single movie's details: which approved
  cinemas offer it, and its upcoming showtimes across all of them,
  optionally filtered to one calendar date.
- **`/showtimes`** — cross-cinema upcoming-showtimes list, filterable by
  date and (via query params) `cinemaId`/`movieId`, paginated.
- **`/showtimes/[showtimeId]`** — a single showtime's details (movie,
  cinema, screen, start time, price/currency) with a "Select seats" link.
- **`/booking-unavailable`** — the clearly-labeled placeholder "Select
  seats" leads to. Reads and writes nothing; it's a static message plus
  navigation back to browsing. Seat holds, seat maps, and booking creation
  are explicitly Phase 4 work (`docs/architecture-plan.md`) — this route
  exists only so Phase 3 has a real navigation target instead of a dead
  link or a partially-built booking flow.

## Public-data eligibility rules

- A cinema is publicly visible **only if** `status = 'approved'`. Draft
  (`pending_review`), `rejected`, and `suspended` cinemas are never shown,
  and a public visitor cannot distinguish "doesn't exist" from "exists but
  isn't approved" — both render the same generic 404 on
  `/cinemas/[cinemaId]` and `/movies/[movieId]`.
- `movies` itself is world-readable at the RLS layer
  (`movies_select_public: using (true)`) because it's the platform-wide
  admin-curated catalog — but Phase 3's *public browsing* rule is
  narrower: a movie only appears on `/movies` or gets its own
  `/movies/[movieId]` page if it's actually associated with at least one
  approved cinema via `cinema_movies`. That set is derived from
  `cinema_movies`, whose own RLS already scopes visible rows to
  approved-cinema associations for an anonymous caller — the app-layer
  query builds the eligible movie-id set from that, rather than listing
  every row in the master catalog.
- A showtime is publicly visible only if it belongs to an approved cinema
  (`showtimes_select` RLS). "Upcoming" (excluding past showtimes) is an
  **application-layer `WHERE starts_at >= now()` filter**, not a security
  boundary — a past showtime at an approved cinema is still readable at
  the database layer (confirmed in the integration tests), it's simply
  excluded from the default "upcoming" list and shown as "already started
  or ended" if visited directly via its permalink.
- Cinema staff records, `permissions` jsonb, audit logs, other users' data,
  and any admin/owner-only management data are never exposed on any public
  route — none of the public pages query `cinema_staff`, `audit_logs`,
  `users`, `bookings`, `payments`, or `notifications` at all.

## Query and RLS behavior

Every public page uses `createServerSupabaseClient()` (session-bound,
RLS-enforced) — the same client every authenticated page in the app uses.
For an anonymous visitor this resolves to the `anon` Postgres role;
Supabase/PostgREST enforces the same RLS policies either way. Several
pages add an explicit application-layer filter (e.g.
`.eq("status", "approved")` on `/cinemas`) even though RLS already
narrows the result set — this is deliberate belt-and-suspenders, matching
the layered-defense pattern `docs/security.md` already establishes for
every other part of the app (RLS is the actual backstop, not the only
line of defense).

## Search and filtering behavior

- **Cinema search** (`/cinemas?q=`): case-insensitive substring match on
  cinema **name only** (not `location`) via a single `.ilike()` call.
  Search was deliberately kept to one column rather than an OR-across-two-
  columns query — PostgREST's `.or()` filter syntax uses commas as a
  field separator, and a user-supplied search term containing a comma
  could otherwise be misinterpreted as an additional filter clause. This
  is a correctness/robustness decision, not a SQL-injection concern
  (Supabase's query builder parameterizes values either way).
- **Movie search** (`/movies?q=`): case-insensitive substring match on
  `title`, applied after narrowing to the approved-cinema-offered movie-id
  set (see above).
- Both searches escape `%`, `_`, and `\` in the user's input
  (`lib/catalog/browse-query.ts`'s `escapeIlikeWildcards`) before building
  the `ILIKE` pattern, so a search term containing those characters is
  matched literally rather than as a wildcard pattern.
- **Date filtering** (`/cinemas/[id]?date=`, `/movies/[id]?date=`,
  `/showtimes?date=`): a `YYYY-MM-DD` string is validated (including
  rejecting calendar-invalid dates like `2026-13-40`) and converted to a
  `[start, end)` UTC window via `utcDayBounds`. An invalid or malformed
  date silently falls back to "no date filter" rather than erroring the
  page.
- **Pagination** (`?page=`): 20 results per page (`PAGE_SIZE`), computed
  via Supabase's `.range()`. A missing/invalid/negative page defaults to
  1; an excessively large page is clamped to `MAX_PAGE` (500) so a crafted
  `?page=999999` can't force an unbounded `OFFSET` scan.
- All of the above (`parsePageParam`, `parseSearchParam`, `parseDateParam`,
  `isValidUuid`, `rangeForPage`, `totalPages`, `escapeIlikeWildcards`,
  `buildContainsPattern`, `utcDayBounds`) are pure, DB-free functions in
  `lib/catalog/browse-query.ts`, unit-tested independently of any database
  or Next.js request — same pattern as `lib/catalog/seat-layout.ts` and
  `lib/catalog/overlap.ts` from Phase 2.
- Route params (`cinemaId`, `movieId`, `showtimeId`) are validated as
  well-formed UUIDs (`isValidUuid`) before ever being used in a query; a
  malformed id renders `notFound()` immediately.

## Showtime visibility rules

- Default view (no `?date=`): only showtimes with `starts_at >= now()`,
  ordered ascending, capped at 50 rows on detail pages and paginated (20
  per page) on `/showtimes`.
- With `?date=YYYY-MM-DD`: showtimes within that UTC calendar day only
  (`utcDayBounds`), regardless of whether the date is in the past,
  present, or future — a deliberate choice so a visitor can look up what
  showed on a specific past date if they follow a direct link, without
  that becoming the *default* view.
- A showtime's own permalink (`/showtimes/[showtimeId]`) is reachable
  regardless of whether it's in the future or past; a past showtime is
  shown with "This showtime has already started or ended." instead of a
  "Select seats" link.

## Empty and error states

- No approved cinemas at all → "No approved cinemas are available yet."
- No cinemas match a search → `No approved cinemas match "…"`.
- A cinema has no movies in `cinema_movies` yet → "This cinema hasn't
  added any movies yet."
- No upcoming showtimes (with or without a date filter) → "No upcoming
  showtimes." / `No showtimes on <date>.`
- No movies currently offered by any approved cinema → "No movies are
  currently showing at any approved cinema."
- No movies match a search → `No movies match "…"`.
- An invalid/non-existent/non-approved `cinemaId`, `movieId`, or
  `showtimeId` → Next.js `notFound()` (standard 404), never a raw error
  page and never information distinguishing "doesn't exist" from "exists
  but private".
- A Supabase query error (network/transient failure) → a `role="alert"`
  message asking the visitor to try again, rather than an uncaught
  exception reaching the App Router's default error boundary.

## Tests added

- **`tests/unit/browse-query.test.ts`** (33 tests) — every pure helper in
  `lib/catalog/browse-query.ts`: page-param clamping/defaulting,
  search-param trimming/truncation, date validation (including
  calendar-invalid dates), UUID validation, pagination range/page-count
  math, ILIKE wildcard escaping, and UTC day-bounds computation.
- **`tests/integration/public-browsing-rls.test.ts`** (14 tests, real
  Postgres via the `anon` role) — approved cinemas are visible and
  pending/suspended cinemas are not; `cinema_staff`/`audit_logs`/`users`
  remain unreadable to an anonymous visitor; a movie offered at an
  approved cinema is visible via `cinema_movies` while one offered only at
  a pending cinema is not (while confirming the master `movies` table
  itself stays world-readable, which is why the app-layer eligibility
  check exists); showtimes at an approved cinema are visible (including a
  past one, at the RLS layer) while a showtime at a non-approved cinema is
  not; screens for an approved cinema are readable; and an anonymous
  visitor cannot write to `showtimes` at all.
- Existing Phase 0–2 test suites (102 unit tests across
  `tests/unit/*.test.ts`, plus the existing integration files) were run
  unmodified and continue to pass — see verification results below.

## Known limitations intentionally deferred

- **No per-cinema timezone.** `showtimes.starts_at` is stored UTC with no
  timezone column on `cinemas` in the current schema. Public pages render
  times with `new Date(...).toLocaleString()` in a Server Component —
  the exact same pattern the existing owner-dashboard showtimes page
  already uses (`app/(owner-staff)/dashboard/[cinemaId]/showtimes/page.tsx`)
  — so this is a pre-existing project-wide convention, not a new
  inconsistency introduced by Phase 3. A future phase could add a
  `timezone` column to `cinemas` and render cinema-local time instead.
- **Movie eligibility scan is bounded, not indexed.** `/movies` builds its
  "offered by an approved cinema" id set from up to 5,000
  `cinema_movies` rows in a single query, then dedupes/paginates from
  there. This is a single bounded query (not N+1) and generous for any
  realistic Phase 3 dataset, but isn't a scalable long-term design for a
  very large catalog — a materialized view or a dedicated distinct-movies
  query would be the Phase 9-style hardening candidate if this ever
  becomes a real bottleneck.
- **No stable slugs.** Routes use the existing UUID primary keys directly
  (`/cinemas/<uuid>`, `/movies/<uuid>`, `/showtimes/<uuid>`) since the
  schema has no slug column and Phase 3's instructions explicitly say not
  to make schema changes merely for cleaner URLs.
- **No realtime seat map, seat holds, or booking creation** — entirely out
  of scope for Phase 3, deferred to Phase 4 per the roadmap. The "Select
  seats" action links to `/booking-unavailable`, a clearly-labeled
  placeholder.
- **No Playwright/E2E coverage** for the new routes — Playwright is listed
  as "Planned" project-wide in `docs/architecture-plan.md` and hasn't been
  wired into this repository yet; not something Phase 3 introduces on its
  own.

## Local verification steps

```bash
npm ci
npm run lint
npm run typecheck
npm test                    # unit tests, no DB required
npm run build

# Integration tests need a live Postgres instance — see README.md:
psql "$DATABASE_URL" -f tests/integration/fixtures/local-auth-shim.sql
npm run db:migrate
psql "$DATABASE_URL" -f tests/integration/fixtures/local-auth-grants.sql
TEST_DATABASE_URL=... APP_DATABASE_URL=... npm run test:integration
```

Manual smoke test (after `npm run dev` with a real Supabase project
configured in `.env.local`, and at least one approved cinema with a movie
and a future showtime in the database):

1. Visit `/cinemas` — confirm only approved cinemas appear; search by a
   partial name.
2. Open a cinema's detail page — confirm its movies and upcoming
   showtimes appear; try the date filter.
3. Visit `/movies` — confirm only movies offered by an approved cinema
   appear; search by a partial title.
4. Open a movie's detail page — confirm the cinemas offering it and its
   upcoming showtimes appear.
5. Visit `/showtimes` — confirm pagination and date filtering work.
6. Open a showtime's detail page — confirm "Select seats" links to
   `/booking-unavailable` and that page links back correctly.
7. Try `/cinemas/<a-real-pending-review-cinema-id>` (as an admin, look one
   up) — confirm it 404s for a logged-out visitor.
