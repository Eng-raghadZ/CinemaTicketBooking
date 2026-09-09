# Comprehensive Pre-Phase-4 Security Audit

## Audited Baseline

- Repository: `Eng-raghadZ/CinemaTicketBooking`
- Branch: `main`
- Commit: `e5feb881c77c7fac32101e59657a6723ec8e0959`
- Audit date: 2026-09-09
- Repository state: clean; local `main` matched `origin/main`
- Scope reviewed: all 121 tracked files, all 16 SQL migrations, application code, configuration, workflows, tests, and project documentation
- Mutations during audit: none

## Verification Evidence

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm test`: 159/159 unit tests passed
- `npm run build`: passed
- Fresh database migration: migrations `0001`–`0016` applied successfully
- `npm run test:integration`: 173/173 integration tests passed
- RLS was enabled on all 18 application tables
- Existing tenant-isolation tests and the active-seat uniqueness index were verified

Passing tests describe the behavior currently covered; they do not eliminate untested booking-boundary weaknesses identified below.

## Verdict

**NOT READY FOR PHASE 4**

Phases 0–3 are substantially implemented and verified. Phase 4 introduces booking ownership, seat contention, price integrity, and later payment impact. The current booking foundation gives an authenticated client too much authority over security-sensitive fields and relationships. The blocking findings below must be remediated before implementing the customer booking flow.

## Blocking Finding 1 — Vulnerable Dependency Baseline

### Evidence

The audit reported five dependency advisories, including:

- a critical advisory affecting the installed Next.js baseline;
- high-severity advisories in the Drizzle/PostCSS/sharp dependency area;
- a moderate advisory affecting `qs`.

### Risk

Known framework or transitive dependency vulnerabilities may affect request handling, builds, image processing, or other reachable application paths. A successful build does not mean the dependency baseline is secure.

### Required remediation

1. Record the exact installed versions and advisory identifiers from `npm audit`.
2. Upgrade to the smallest secure compatible versions.
3. Review `package.json` and `package-lock.json`; do not use an uncontrolled force upgrade.
4. Review framework migration notes for behavior or security changes.
5. Rerun dependency audit, lint, typecheck, unit/integration tests, and production build.
6. Document any advisory that remains, why it is not reachable, and when it will be removed. Critical reachable findings cannot be accepted for the Phase 4 gate.

## Blocking Finding 2 — Client-Authoritative Booking Creation

### Evidence

The authenticated role can insert its own `pending` booking. The row accepts client-supplied values including:

- `cinema_id`;
- `showtime_id`;
- `total_amount`;
- `platform_fee_amount`;
- `currency_code`;
- `max_seats_per_booking`;
- `idempotency_key`.

The insert policy primarily proves `user_id = auth.uid()` and `status = 'pending'`. It does not make the client-supplied financial values or cinema/showtime relationship authoritative.

### Risk

An authenticated caller can attempt to create internally inconsistent bookings, understate amounts or fees, choose an arbitrary currency, associate a booking with a cinema that does not own the showtime, or raise the per-booking seat limit. Later payment code must not inherit or trust these rows.

### Required remediation

1. Revoke direct authenticated `INSERT` access to `bookings` and `booking_seats`, unless a narrowly proven grant remains necessary.
2. Create a narrowly scoped server-controlled transactional operation for booking drafts/holds.
3. Derive the user from `auth.uid()` and derive cinema, price, currency, and seat limit from trusted database records/configuration.
4. Reject non-approved cinemas and unavailable/past showtimes according to the confirmed booking rules.
5. Make retries idempotent without letting one user collide with or reuse another user's key.
6. Do not expose arbitrary booking-status or financial-field mutation paths to clients.

### Required regression tests

- A client cannot choose `user_id`.
- A client cannot choose or lower totals/fees.
- A client cannot choose currency or seat limit.
- A mismatched `cinema_id` and `showtime_id` is rejected.
- Cross-user and cross-cinema IDOR attempts are rejected.
- Repeating the same authorized request is idempotent and does not create duplicate bookings.

## Blocking Finding 3 — Client-Controlled Seat-Hold Expiry and Incomplete Hold Integrity

### Evidence

Authenticated users can insert their own `seat_holds` rows, but `expires_at`, `showtime_id`, and `seat_id` are supplied on insert. The existing active uniqueness index prevents two active rows for the same `(showtime_id, seat_id)`, but it does not prove that the seat belongs to the showtime's screen or that the expiry is the configured 10-minute server-controlled value.

### Risk

A caller can attempt an excessively long hold, a seat/showtime mismatch, or another invalid relationship while still satisfying the simple ownership policy. The uniqueness index prevents one class of double allocation but does not make the hold valid as a whole.

### Required remediation

1. Revoke direct authenticated hold insertion or replace it with a narrow transactional database/server operation.
2. Set `user_id` from `auth.uid()` and calculate `expires_at` inside the trusted operation.
3. Verify that the showtime exists, belongs to an approved/mutable booking context, has not started, and uses a valid screen.
4. Verify every selected seat belongs to that showtime's screen.
5. Preserve the active `(showtime_id, seat_id)` uniqueness guarantee.
6. Define retry, partial-failure, release, and expired-hold behavior transactionally.

### Required regression tests

- A caller cannot extend or choose expiry.
- A seat from another screen/cinema is rejected.
- A past or invalid showtime is rejected.
- Two concurrent users cannot both acquire the same seat.
- A failed multi-seat request leaves no partial unauthorized hold set.
- Expired holds are released safely and cannot release a newer valid hold.

## Blocking Finding 4 — Maximum-Eight-Seats Rule Is Client-Influenceable and Race-Prone

### Evidence

`bookings.max_seats_per_booking` is insertable as part of the client-created booking row. The `enforce_max_seats_per_booking()` trigger reads that value and performs a count-then-insert check on `booking_seats` without an explicit per-booking serialization mechanism.

### Risk

A caller can attempt to raise the stored limit above the confirmed maximum of eight. Concurrent inserts can also observe the same pre-insert count and collectively exceed the intended limit.

### Required remediation

1. Remove the seat limit from client authority.
2. Derive the configured limit inside the database/server operation, with eight as the current confirmed rule.
3. Serialize mutations for the same booking using a reviewed locking/advisory-lock strategy or redesign the write so the limit is enforced atomically.
4. Add a database-level invariant that cannot be bypassed by calling PostgREST directly.

### Required regression tests

- A client cannot set a limit above eight.
- A ninth seat is rejected with no partial state.
- Simultaneous inserts cannot collectively exceed eight.
- Concurrent operations on unrelated bookings do not block each other unnecessarily.

## Required Phase 4 Read Path

Before the seat-map UI is connected, define a supported seat-availability read path. It must return only the minimum state needed to render availability, respect approved-cinema/showtime rules, and avoid exposing hold owners, user identifiers, private booking data, payment data, or internal tokens.

Realtime subscriptions, if used, must enforce the same visibility boundary and must not rely on hiding fields only in client code.

## Additional Mandatory Review Areas

The remediation must re-check:

- grants for `authenticated`, `anon`, and function execution;
- every booking/hold RLS policy and trigger;
- `SECURITY DEFINER` ownership, fixed `search_path`, schema qualification, and execution grants;
- service-role call sites and user-controlled identifiers;
- cron authentication and expiry-job replay/concurrency behavior;
- Realtime publications and private-column exposure;
- cache behavior for user-specific availability/booking responses;
- logging and error responses for secret or private-data leakage.

## Security Gate Exit Criteria

Phase 4 may begin only when:

1. every blocking finding has an implemented fix and direct regression coverage;
2. no unresolved critical/high issue affects the Phase 4 trust boundary;
3. direct PostgREST bypass attempts fail safely;
4. financial and relationship fields are server/database derived;
5. hold acquisition and the eight-seat limit pass genuine concurrent-transaction tests;
6. fresh and incremental migrations pass with data-preservation evidence;
7. unit, integration/RLS, lint, typecheck, build, and focused manual security tests pass;
8. the remediation PR is reviewed and merged into `main`;
9. the updated `main` is re-audited and `architecture-plan.md`, `security.md`, and `README.md` are updated to record the real post-remediation state.

## Implementation Rule

This document describes required outcomes, not permission to weaken existing protections. Do not modify old deployed migrations, relax RLS/tests, or move booking logic to the client to make Phase 4 easier. Use new forward-only migrations and preserve verified Phase 0–3 behavior.
