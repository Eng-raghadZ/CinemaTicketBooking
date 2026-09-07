# Authorization Hardening — Suspended-Cinema Enforcement, Admin Route Fix, Runtime Privilege Audit

This documents a focused corrective pass driven by confirmed manual E2E
findings, on top of the verified Phase 0–3 baseline (including the public
browsing RLS/grant fix and pagination fix). Two new forward-only migrations
(`0015`, `0016`) were added; no existing migration (`0001`–`0014`) was
modified.

## 1. Authoritative cinema-state policy

This table is now the single source of truth for what a cinema's `status`
permits, superseding any looser prior assumption:

| `status`         | Owner/authorized manager internal access | Internal mutations            | Public visibility |
|------------------|:-----------------------------------------:|:------------------------------:|:------------------:|
| `pending_review` | Allowed                                    | Allowed                        | Hidden              |
| `rejected`       | Allowed                                    | Allowed                        | Hidden              |
| `approved`       | Allowed                                    | Allowed                        | Visible             |
| `suspended`      | Read-only                                  | Forbidden for non-admin users  | Hidden              |

- Active owners, managers, and staff retain read access to a suspended
  cinema and its preserved internal data (screens, seats, cinema_movies,
  showtimes, staff roster) — nothing about this pass changes any
  `*_select` RLS policy.
- A suspended cinema cannot have its catalog, staff, screens, seats,
  cinema-movie associations, showtimes, prices, or profile mutated by any
  non-admin user — enforced at the database layer (RLS + functions +
  triggers), not just in Server Actions or the UI.
- `platform_admin` retains full ability to inspect, suspend, reinstate,
  and otherwise administer suspended cinemas at all times.
- Reinstatement (`suspended → approved`) restores normal internal
  mutation capability and public visibility without recreating or
  duplicating any data — verified directly (see "Verification" below).
- Public visibility was already correctly restricted to `approved` only
  (`cinemas_select_public_approved` and every `*_select` policy's
  `exists (... c.status = 'approved')` branch) — unchanged by this pass.

## 2. Database changes (`0015_suspended_cinema_state_enforcement.sql`)

### New helper: `cinema_is_mutable(cinema_id)`

A single, narrowly-scoped predicate — true iff the cinema is **not**
suspended. Deliberately standalone, not folded into `is_active_cinema_staff`
or `can_manage_cinema_staff`, because those are read-access helpers and
must keep working identically for a suspended cinema.

### Catalog mutations (screens, seats, showtimes): `can_manage_catalog`

`can_manage_catalog` is used **exclusively** by mutation-authorizing
policies (never by a `*_select` policy), so it was safe to extend directly
with an inline `c.status <> 'suspended'` join condition. This required no
grant changes at all — the function's existing `EXECUTE` grants
(`authenticated`, `service_role` from `0013`; `anon` from `0014`, needed
because it's referenced inside `for all` policies that also govern
`SELECT`) are unaffected by a change to its internal body. Covers screens,
seats (via a subquery joining screens), and all three showtime mutation
policies (insert/delete/update-pricing) in one place.

### `cinema_movies` mutations

`cinema_movies_write` (a `for all` policy, untouched by `0013`) was split
into `cinema_movies_insert` and `cinema_movies_delete`, each requiring
`cinema_is_mutable(cinema_id)` — mirroring the exact pattern `0013`
already established for `showtimes`, for the same reason: a `for all`
policy's `USING` clause also applies to `SELECT`, and this table is
publicly readable (see the `0014` postmortem in
`docs/phase3-customer-browsing.md`).

### Cinema staff: view/manage separation

`can_manage_cinema_staff` is used for both viewing
(`cinema_staff_select`) and mutation authorization — the task explicitly
required NOT adding a suspended condition directly to it, since that would
also break viewing a suspended cinema's roster. A new, narrowly-scoped
wrapper, `can_mutate_cinema_staff(cinema_id)` (`can_manage_cinema_staff(...)
AND cinema_is_mutable(...)`), is used only in mutation contexts:

- `cinema_staff_insert` (invite) now requires `can_mutate_cinema_staff`.
- `enforce_cinema_staff_update_scope()` (accept/revoke/reinvite trigger)
  gained a `cinema_is_mutable(old.cinema_id)` condition on all three
  non-admin branches (self-accept, manager-revoke, manager-reinvite). The
  owner-membership-immutability guards, the "no owner via update" guard,
  and the admin/service-role bypass are preserved byte-for-byte from
  `0012`.
- `can_view_managed_staff_user` (`0009`) is completely untouched — it
  continues to support read-only staff display regardless of cinema
  status, and its existing cinema-scoping means cross-cinema isolation
  was never affected.

### Cinema profile: sensitive-column protection + owner-only editing

Two independent fixes, since they're conceptually different rules:

1. **RLS narrowed**: `cinemas_update_staff_or_admin` (any active staff) →
   `cinemas_update_owner_or_admin` (owner or admin only). **Decision,
   documented explicitly**: only the cinema `owner` may edit profile
   fields for now — no `STAFF_PERMISSION_KEYS` entry currently covers
   cinema-profile editing, so extending this to an explicitly-permissioned
   manager role is deferred until such a key is added (validation + RLS +
   docs + tests together), consistent with how every other permission key
   in this codebase was introduced.
2. **Column protection extended**: `enforce_cinema_status_change_admin_only`
   (`0004`) previously protected only `status`/`reviewed_by`/`reviewed_at`.
   It now also protects `rejection_reason`, `primary_owner_id`, `id`, and
   `created_at` — previously, an owner passing the old, broader "any
   active staff" RLS check could have set `primary_owner_id` or
   `rejection_reason` directly.
3. **New trigger**: `enforce_cinema_profile_update_scope()` — independently
   requires the caller to be the cinema's active `owner` AND the cinema to
   be mutable, for any UPDATE reaching this far (defense-in-depth
   alongside the RLS narrowing above).

**Allowed owner-editable profile columns** (documented decision, derived
from `registerCinemaSchema` / the existing registration flow, since no
profile-edit Server Action exists yet): `name`, `description`, `location`,
`country_code`, `currency_code`. Everything else on `cinemas` is either
admin-only (see above) or immutable.

### Status-transition legality

`enforce_cinema_status_change_admin_only` also now validates every status
change against exactly four legal edges, **regardless of caller**
(including `platform_admin` and the trusted service-role connection):

```
pending_review → approved
pending_review → rejected
approved       → suspended
suspended      → approved
```

No existing Server Action or scheduled job ever attempts a transition
outside these four edges, so this adds no restriction to any real
workflow — it only rejects transitions nothing legitimate ever performs
(e.g. `rejected → approved`, `suspended → rejected`, `approved →
pending_review`). "Administer suspended cinemas" means performing the
four listed legitimate actions, not setting status to an arbitrary value.

### `auth.uid() IS NULL` bypass — verified, not changed

Every trigger in this codebase (`0004`, `0013`, and now `0015`) bypasses
its non-admin checks when `auth.uid() IS NULL`, intended for the trusted
service-role connection. This was explicitly verified to be unreachable by
`anon`/unauthenticated requests: `anon` holds **only** `SELECT` grants
anywhere in the schema (`0007`), so it can never issue an `INSERT`/
`UPDATE`/`DELETE` in the first place, regardless of what any trigger's
bypass condition evaluates to. `authenticated` sessions always carry a
`sub` claim (Supabase Auth never issues an `authenticated`-role JWT
without one), so `auth.uid()` is never `NULL` for a real authenticated
request either. This bypass pattern was not changed — it was audited and
confirmed sound given the existing grant model, which `0016` further
tightens.

## 3. Runtime privilege hardening (`0016_runtime_privilege_hardening.sql`)

A real hosted Supabase project provisions `anon`/`authenticated` with
platform-level default grants **before** this repository's own migrations
run — confirmed to currently include `TRUNCATE`, `TRIGGER`, and
`REFERENCES` on `public`-schema tables, none of which any Server Action or
public-browsing query ever needs. `0007`'s own additive grants never
revoked these platform defaults.

**Fix**: `revoke all on all tables in schema public from anon,
authenticated;` (a clean slate, regardless of where the privilege came
from), followed by re-affirming exactly `0007`'s and `0013`'s existing
grants verbatim. Idempotent and safe against both an already-correct
database (re-granting is a no-op) and one carrying the broader platform
defaults (the revoke removes them). `service_role` is untouched.

- `anon` still cannot reach `cinema_staff`, `audit_logs`, `users`,
  `bookings`, `payments`, `notifications`, `seat_holds`, `user_roles`,
  `platform_policy_limits` at all — verified in both
  `tests/integration/public-browsing-rls.test.ts` and the new
  `tests/integration/authorization-hardening.test.ts`.
- No sequences exist in this schema requiring a grant audit — every
  primary key is a UUID default, not `serial`/`bigserial`.
- `EXECUTE` grants on every `SECURITY DEFINER` function were audited (see
  inline comments in `0015`): functions needed for combined-OR read
  evaluation (`is_platform_admin`, `is_active_cinema_staff`,
  `cinema_staff_role_for`, `can_manage_cinema_staff`) keep their default
  PostgreSQL-granted `PUBLIC` execute, since they reveal only booleans and
  are required for `anon`'s existing public-browsing paths to evaluate
  without erroring (the exact class of bug `0014` fixed). Functions that
  are purely mutation-authorizing and never directly embedded in a
  `SELECT`-combined policy (`can_mutate_cinema_staff`, `cinema_is_mutable`)
  are revoked from `PUBLIC` and granted only to `authenticated`/
  `service_role`, since `anon` never has a write grant on any table they
  gate anyway.

## 4. Admin-route `ForbiddenError` handling (Part 7)

**Root cause**: `app/(admin)/dashboard/cinemas/page.tsx` and
`app/(admin)/dashboard/movies/page.tsx` called the raw, throwing
`requirePlatformAdmin()` instead of the already-existing
`requirePlatformAdminOrRedirect()` wrapper (which
`app/(admin)/dashboard/cinemas/[cinemaId]/page.tsx` already used
correctly). An authenticated non-admin owner hitting either page therefore
saw Next.js's unhandled Runtime Error overlay (stack trace, file path)
instead of a controlled access-denied experience.

**Fix**: both call sites now use `requirePlatformAdminOrRedirect()` — no
new guard logic was needed, since the correct, shared mechanism already
existed and was already proven correct by its use on the `[cinemaId]`
detail page. This automatically:

- redirects an authenticated non-admin to `/access-denied` (the same
  shared page owner/staff routes already use via
  `requireCinemaStaffOrRedirect`);
- redirects an unauthenticated visitor to `/login`;
- rethrows any other, genuinely unexpected error unchanged (never
  swallowed behind the access-denied page).

Regression coverage: `tests/unit/admin-route-guards.test.ts` exercises
`requirePlatformAdminOrRedirect` and `requireCinemaStaffOrRedirect`
directly (with `@/lib/auth/server` and `next/navigation` mocked), asserting
the ForbiddenError → `/access-denied`, UnauthorizedError → `/login`,
admin-success → no redirect, and genuine-error → rethrown-not-redirected
cases.

## 5. Suspended-cinema UI (read-only communication)

Database enforcement is mandatory and was the primary fix, but presenting
an active "Invite", "Add movie", "Create screen", or "Schedule showtime"
form on a suspended cinema would be guaranteed to fail on submission. The
four owner-staff management pages
(`staff`/`movies`/`screens`/`showtimes`) now additionally fetch the
cinema's `status` and gate their mutation controls on it, replacing the
form with a clear `role="alert"` message ("This cinema is suspended — …
management is read-only until it is reinstated.") when suspended. The
top-level cinema dashboard page already showed a suspension banner from
Phase 1 (`{cinema.status === "suspended" && <p role="alert">This cinema is
currently suspended.</p>}`) — unchanged.

## 6. Testing

- **`tests/integration/authorization-hardening.test.ts`** (54 tests, real
  Postgres) — runtime grants (`TRUNCATE` denied, private tables
  inaccessible, public reads still work), cross-cinema isolation,
  membership safety (self-promotion/permission-change/cinema-move all
  rejected, suspended-cinema invite/accept/revoke/reinvite all rejected,
  owner-membership protections intact), cinema-column safety (staff/
  manager cannot edit profile, `primary_owner_id`/`rejection_reason`
  immutable for non-admin, owner can edit allowed fields on
  pending/rejected cinemas but not suspended, admin review/reinstate still
  work), catalog behavior across all four states for screens/cinema_movies/
  showtimes (including that reinstating restores writes and public
  visibility with a verified-identical row count), and status-transition
  legality (all four legal edges succeed, four illegal edges rejected even
  for `platform_admin`, non-admin status changes rejected, illegal
  attempts leave no `audit_logs` trail).
- **`tests/unit/admin-route-guards.test.ts`** (7 tests) — see section 4.
- All pre-existing suites (135 unit tests unaffected by this pass's
  additions to `browse-query`/pagination, 119 pre-existing integration
  tests across `rls-and-constraints`, `catalog-permissions-rls`, and
  `public-browsing-rls`) continue to pass unmodified.

## 7. Verification — genuinely run, not skipped

Unlike prior passes in this history, database-backed integration tests
**were actually executed** in this environment: PostgreSQL 16 was
installed locally (`apt-get install postgresql`, using the
already-allow-listed `archive.ubuntu.com`/`security.ubuntu.com` package
mirrors) rather than reported as unavailable.

- `npm run lint` — pass
- `npm run typecheck` (root + `tests/integration/tsconfig.json`) — pass
- `npm test` — **159/159** unit tests pass
- `npm run build` — pass, all routes registered
- `npm run db:migrate` against a **clean** database — all 16 migrations
  (`0001`–`0016`) applied cleanly in one run
- `npm run db:migrate` applied **incrementally**: a second database was
  brought to exactly the `0001`–`0014` state first (simulating an
  already-migrated production database), then `0015`/`0016` were applied
  via the project's own migration runner — applied cleanly, 2 migrations
  detected and run, 14 correctly skipped as already-applied
- **Data-preservation check**: a third database was seeded with realistic
  data across every affected table (`users`, `user_roles`, `cinemas`
  including a `suspended` one, `cinema_staff`, `screens`, `seats`,
  `movies`, `cinema_movies`, `showtimes`, `audit_logs`) at the `0001`–
  `0014` baseline, MD5-checksummed per table, then `0015`/`0016` were
  applied and the checksums recomputed — **byte-for-byte identical**
  before and after, confirming zero data loss, deletion, or mutation
- A direct functional spot-check confirmed a pre-existing (pre-hardening)
  staff member of a retroactively-suspended cinema can still read an
  existing screen but cannot rename it (0 rows affected)
- `npm run test:integration` against the freshly-migrated clean
  database — **173/173** tests pass across all four integration files
  (64 + 54 + 32 + 23)

No test was skipped due to unavailable credentials or services in this
pass.

## 8. Remaining risks / decisions for review

- Owner-only cinema-profile editing is a deliberate, documented scope
  decision (see section 2) — extending to managers requires a new
  permission key, out of this fix's scope.
- `country_code`/`currency_code` remain owner-editable alongside
  `name`/`description`/`location`; no requirement in this task called for
  locking those down further, and no profile-edit Server Action exists yet
  to exercise them in practice.
- `cinema_cancellation_policies` was not touched — it's not in the
  explicitly listed table scope for this pass, and its own `for all`
  write policy already uses only default-`PUBLIC`-executable functions,
  so it doesn't share the `can_manage_catalog`-style risk class.
- The runtime-grant fix (`0016`) is a no-op on a fresh local/CI Postgres
  instance (roles are created with zero privileges by `0007`'s own
  `create role ... nologin noinherit` block) — its real effect is only
  observable against a genuine Supabase-hosted project's pre-existing
  broader defaults, which this sandbox cannot fully simulate; the
  clean-slate-then-regrant approach was still fully exercised here
  (revoke-then-regrant produced an identical, correct end state).
