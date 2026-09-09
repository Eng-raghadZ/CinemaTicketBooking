# Security Model and Current Security Status

*Status-aligned revision: 2026-09-09. This document describes the implemented Phase 0–3 security model and the open blockers identified by the pre-Phase-4 audit.*

For the current delivery status and phase gates, see [`architecture-plan.md`](architecture-plan.md). SQL migrations in `supabase/migrations` and the current application code remain authoritative when documentation and implementation differ.

## Layered Authorization

Authorization is enforced at independent boundaries:

1. **Middleware/session boundary** — `middleware.ts` redirects unauthenticated users away from protected route groups. This is intentionally coarse and does not establish cinema-level authorization.
2. **Server boundary** — Server Actions, Route Handlers, and server-rendered protected pages re-check the authenticated user, role, cinema membership, membership status, and required permission for the target resource.
3. **Database boundary** — PostgreSQL grants, RLS policies, constraints, and triggers scope access and protect sensitive fields and state transitions.

UI visibility is convenience only. Hiding a control is never considered authorization.

## Platform and Cinema-Scoped Authorization

- New users begin with the `customer` platform role through the trusted auth synchronization flow.
- Ordinary users cannot insert or update `user_roles` directly.
- Cinema owners, managers, and staff are represented by cinema-scoped `cinema_staff` rows.
- Membership must be active and belong to the target cinema before it grants operational access.
- Owner membership cannot be created through the ordinary staff invitation or update paths.
- Cross-cinema access must be rejected by both server guards and RLS.

## Fixed Staff Permission Vocabulary

The application recognizes only these staff permission keys:

```text
manage_staff
manage_showtimes
manage_pricing
manage_screens
view_bookings
manage_bookings
check_in_tickets
```

Unknown keys are rejected by validation. Catalog permissions are enforced at both the application and database layers after migration `0013_catalog_permission_enforcement.sql`:

- `manage_screens` controls screen creation/deletion and seat insertion.
- `manage_showtimes` controls showtime creation/deletion.
- `manage_pricing` controls price-only showtime updates.
- Owners pass cinema-management permission checks for their own cinemas.
- Master movie creation and editing remain platform-admin only.
- Cinema-movie association changes currently remain owner/manager role-tier operations because no dedicated `manage_movies` permission exists.

## Column, Relationship, and State Protections

- Cinema owners may edit only the approved profile fields; review/status and ownership fields are protected.
- Cinema state transitions are limited to the documented legal transition graph.
- Suspended cinemas remain readable internally but are immutable for non-admin users and hidden publicly.
- Non-admin showtime updates are limited to `base_price`; scheduling identity fields are protected by trigger.
- Showtime insertion verifies that the screen belongs to the supplied cinema, the movie is selected by that cinema, and currency matches the cinema.
- Deleting a screen that still has showtimes is blocked for non-admin users to prevent an unauthorized cascade deletion.
- Booking check-in updates are constrained so cinema staff cannot rewrite financial fields in the same update.

These protections do not replace the open booking-integrity blockers listed later in this document.

## Public Browsing Boundary

- Anonymous users can read only the public catalog data explicitly granted to `anon`.
- Public cinema, cinema-movie, screen, seat, and showtime visibility is scoped to approved cinemas by RLS.
- Private tables such as `users`, `cinema_staff`, `audit_logs`, `bookings`, `payments`, `notifications`, `seat_holds`, `user_roles`, and `platform_policy_limits` are not granted to `anon`.
- Public browsing uses the session-bound Supabase client and does not use the service-role client.
- Public routes must not reveal whether a hidden cinema exists; unavailable and nonexistent records use the same generic not-found behavior.

## Runtime Privileges and Security-Definer Functions

Migration `0016_runtime_privilege_hardening.sql` revokes broad platform-default table privileges from `anon` and `authenticated`, then re-grants the intended minimum privileges.

Every new or modified `SECURITY DEFINER` function must:

- use explicit schema-qualified object names;
- use a safe, fixed `search_path`;
- validate the authenticated identity and tenant scope internally;
- expose only narrowly defined inputs and outputs;
- revoke default `PUBLIC` execution unless public evaluation is intentionally required and safe;
- receive only the minimum role-specific `EXECUTE` grants;
- have direct integration tests for allowed and denied callers.

## Service-Role and Secrets

- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL_SERVICE_ROLE` are server-only and must never use the `NEXT_PUBLIC_` prefix.
- Service-role credentials must never be logged, returned to clients, or used as a shortcut around ordinary tenant authorization.
- Before adding a new `serviceDb()` caller, verify that all user-controlled identifiers are independently authorized.
- Real secrets belong only in `.env.local`, protected GitHub/Vercel environments, or Supabase configuration; never commit them.
- The cron endpoint requires `CRON_SECRET`; future Stripe webhooks must verify Stripe signatures before processing events.

## Suspended-Cinema Policy

| Cinema status | Internal read | Non-admin mutations | Public visibility |
|---|---:|---:|---:|
| `pending_review` | Allowed to authorized members | Allowed | Hidden |
| `rejected` | Allowed to authorized members | Allowed | Hidden |
| `approved` | Allowed to authorized members | Allowed | Visible |
| `suspended` | Allowed to authorized members | Blocked | Hidden |

Platform administrators retain the explicitly authorized review and administration operations.

## Open Pre-Phase-4 Security Blockers

The 2026-09-09 audit concluded that the audited baseline is **not ready for Phase 4**. The following issues must be resolved before seat selection and booking development begins:

1. **Critical dependency exposure** — upgrade the affected Next.js baseline and related packages to secure compatible versions, review the lockfile diff, and rerun the full suite.
2. **Over-broad booking-table mutation privileges** — authenticated clients currently have direct PostgREST mutation capability over foundational booking tables. Revoke broad writes and expose narrowly scoped, server-controlled transactional commands.
3. **Incomplete booking relational integrity** — the database must prove that a held/booked seat belongs to the showtime's screen and that booking, showtime, screen, seat, and cinema relationships are consistent.
4. **Bypassable/race-prone maximum-seat rule** — the eight-seat limit must not depend on a client-influenced grouping value and must remain correct under simultaneous transactions.
5. **Booking trust-boundary review** — re-audit grants, RLS, triggers, security-definer functions, service-role usage, Realtime publication/policies, and the expiry cron after remediation.

These are release blockers, not Phase 9 backlog items. The complete audit evidence must be stored in `docs/audits/pre-phase-4-security-audit.md`; this section is only the current summary.

## Mandatory Remediation Verification

The security gate may be marked complete only after:

- each audit finding maps to a code/migration fix and regression test;
- fresh and incremental migrations succeed without data loss;
- direct PostgREST bypass attempts are denied;
- cross-user and cross-cinema booking/hold attempts are denied;
- invalid seat/showtime/screen/cinema combinations fail at the database boundary;
- simultaneous hold/booking attempts cannot double-book or exceed eight seats;
- Realtime exposes only the minimum public seat-availability state;
- unit, integration/RLS, concurrency, lint, typecheck, build, and focused manual tests pass;
- the remediation is reviewed, merged into `main`, and followed by a focused re-audit.

## Integration-Test Safety

Database integration tests are destructive and may run only against:

- `cinema_platform_test`, or
- `cinema_platform_ci`.

`TEST_DATABASE_URL` is the administrative fixture connection. `APP_DATABASE_URL` must connect as the ordinary non-superuser `app_test` role so RLS is genuinely exercised. Never point either variable at development, staging, or production data.

## Known Deferred Work

- Stripe and webhook implementation remain Phase 5 work.
- QR generation and scanner UI remain Phase 6 work.
- Notification delivery remains Phase 7 work.
- Rate limiting, broader accessibility/load testing, and final production hardening remain later work, but known critical/high security defects must never be deferred to the final hardening phase.
