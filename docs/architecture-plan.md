# Moviera Multi-Cinema Booking Platform — Architecture & Roadmap (v3)

*Status-aligned revision: 2026-09-09. Updated from the implemented repository and the comprehensive pre-Phase-4 audit.*

> **Source-of-truth rule:** Before starting any phase or major workstream, fetch the latest GitHub state, switch to `main`, update with fast-forward only, confirm `main` matches `origin/main`, and record the exact commit SHA. This document guides the work but never replaces inspection of the current repository.

## 0. Current Project Checkpoint

### Audited baseline

- Repository: `Eng-raghadZ/CinemaTicketBooking`
- Branch: `main`
- Audited commit: `e5feb881c77c7fac32101e59657a6723ec8e0959`
- Audit date: 2026-09-09
- Repository state at audit: clean; local `main` matched `origin/main`
- Database migrations reviewed: 16
- Verification recorded at the audited baseline: 159 unit tests and 173 integration tests passed; lint, typecheck, and production build passed.

### Delivery status

| Workstream | Status | Meaning |
|---|---|---|
| Phase 0 — Foundations | Complete | Auth foundation, schema, RLS baseline, CI/CD, environments, cron scaffolding, policy/check-in helpers |
| Phase 1 — Cinema Onboarding & Staff | Complete | Registration, admin review lifecycle, cinema-scoped staff roles and permissions |
| Phase 2 — Catalog Management | Complete | Admin movie catalog, cinema/movie association, screens/seats, showtimes and pricing |
| Phase 3 — Customer Browsing | Functionally complete and verified | Public cinema/movie/showtime discovery with approved-cinema filtering and tests |
| Moviera homepage/UI | Separate presentation workstream | May integrate completed Phase 3 data; later features must remain honest placeholders |
| Pre-Phase-4 security remediation | **Required next** | Blocking gate; Phase 4 must not begin until all critical/high findings are fixed and retested |
| Phase 4 — Seat Selection & Booking Core | Blocked | Starts only after the security gate passes |

### Current decision

**The project is not ready to begin Phase 4 at the audited commit.** Phase 0–3 behavior is substantially implemented, but booking raises the integrity and financial impact of any authorization or concurrency weakness. The next engineering workstream is therefore **Pre-Phase-4 Security Remediation**, not new booking functionality.

The core stack is unchanged from v1 (Next.js + Supabase Postgres/Auth/Realtime/Storage + Stripe Connect + Resend), because none of the new decisions require a different technology — they change the data model, authorization rules, and workflow logic, which this stack was already chosen to accommodate. Where a decision does change something structurally, it's called out explicitly below.

---

## 1. System Architecture (Updated)

Unchanged from v1 at the infrastructure level. Two additions to the logical architecture:

- **Policy engine**: a small, isolated module (not a separate service) that evaluates cancellation/refund eligibility against layered policy data (global admin rules + per-cinema rules). Lives in `/lib/policy`.
- **Ticketing & check-in**: QR generation on booking confirmation, and a staff-facing validation endpoint that atomically marks a ticket as checked-in exactly once.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js (Vercel)                          │
│  Public site │ Customer area │ Owner/Staff dashboard │ Admin     │
│  Route Handlers / Server Actions = backend API layer              │
│  /lib/policy (cancellation & refund rules)                        │
│  /lib/ticketing (QR generation & check-in validation)             │
└───────────────┬───────────────────────────┬──────────────────────┘
                │                           │
     ┌──────────▼─────────┐       ┌─────────▼──────────┐
     │  Supabase Postgres   │       │   Stripe Connect      │
     │  + Auth + RLS         │       │   (payments, fee-      │
     │  + Storage             │       │   ready, idempotent)  │
     │  + Realtime             │       └─────────────────────┘
     └──────────┬───────────┘
                │
     ┌──────────▼───────────┐      ┌─────────────────┐
     │  Scheduled jobs         │      │  Resend (email,   │
     │  (expire seat holds)    │      │  notification       │
     │                          │      │  abstraction layer) │
     └────────────────────────┘      └─────────────────┘
```

---

## 2. Updated Technology Stack

No changes to the stack table from v1. One addition:

| Layer | Choice |
|---|---|
| QR code generation | **`qrcode`** (npm, server-side generation) — signed payload, no new service needed |

QR generation is a pure function (booking ID + a signed token → PNG/SVG), so it's implemented as a library call inside the existing Next.js backend rather than a new component. No compatibility analysis needed beyond "it's a Node package," which is why it wasn't in v1 — it wasn't yet clear tickets needed to be scannable.

---

## 3. Database Architecture (Updated Schema)

This is where most of the real change lives. Key updates from v1 are marked with **← updated**.

```sql
-- USERS & STAFF
users (id, email, created_at, ...)
user_roles (user_id → users, role: customer|cinema_owner|cinema_staff|platform_admin)
  -- a user can only hold ONE platform-level role; cinema-scoped permissions live separately below

cinema_staff (                                    -- ← NEW: multi-staff support
  id, cinema_id → cinemas, user_id → users,
  role: owner|manager|staff,
  permissions jsonb,                              -- granular overrides beyond the base role
  invited_by → users, status: invited|active|revoked,
  created_at
)
  -- UNIQUE (cinema_id, user_id)
  -- the cinema owner is simply the cinema_staff row with role='owner', created automatically
  -- when the cinema is created — this means "owner" and "staff" share ONE authorization
  -- code path instead of two, which is what makes future role types cheap to add.

-- CINEMAS
cinemas (
  id, primary_owner_id → users, name, description, location,
  status: pending_review|approved|suspended|rejected,   -- ← updated: explicit approval workflow
  reviewed_by → users, reviewed_at, rejection_reason,
  country_code, currency_code default 'XXX',            -- ← NEW: present now, single value enforced
                                                          --   in app logic, not schema — see Section 5
  created_at
)

screens (id, cinema_id → cinemas, name, layout_config jsonb)
seats (id, screen_id → screens, row, number, seat_type)

-- MOVIES (platform-level, not duplicated per cinema)             -- unchanged from v1, confirmed correct
movies (id, title, description, poster_url, duration_minutes, rating, ...)
cinema_movies (cinema_id → cinemas, movie_id → movies)             -- which movies a cinema shows
showtimes (id, cinema_id, screen_id, movie_id, starts_at timestamptz, base_price, currency_code)

-- BOOKING & SEAT HOLDS
seat_holds (
  id, showtime_id, seat_id, user_id, expires_at,
  status: held|booked|released
)
  -- UNIQUE (showtime_id, seat_id) WHERE status IN ('held','booked')  -- double-booking prevention

bookings (
  id, user_id, cinema_id, showtime_id,
  status: pending|confirmed|cancelled|refunded|expired|checked_in,  -- ← updated status set
  stripe_payment_intent_id, idempotency_key,                        -- ← NEW: idempotency_key
  total_amount, platform_fee_amount default 0,                      -- ← NEW: commission-ready
  currency_code,
  ticket_reference uuid,                                            -- ← NEW: unique, QR-encoded
  checked_in_at, checked_in_by → cinema_staff,                      -- ← NEW: check-in tracking
  created_at
)
booking_seats (booking_id → bookings, seat_id → seats)

-- POLICY ENGINE                                                    -- ← NEW section
platform_policy_limits (
  id, min_cancellation_window_hours, max_refund_percentage, ...     -- admin-defined ceiling/floor
)
cinema_cancellation_policies (
  cinema_id → cinemas, cancellation_window_hours, refund_percentage,
  -- validated at write-time (app layer + a Postgres CHECK/trigger) to stay within
  -- platform_policy_limits — a cinema cannot save a policy more lenient than the platform allows
)

-- PAYMENTS
payments (id, booking_id, stripe_object_id, amount, platform_fee_amount, status)

-- NOTIFICATIONS                                                    -- ← NEW: abstraction, not just email
notifications (
  id, user_id, type: booking_confirmed|payment_confirmed|booking_cancelled|
                      refund_confirmed|ticket_delivered|booking_changed,
  channel: email,                       -- enum, extendable to sms|push later without a schema rewrite
  status: pending|sent|failed, sent_at
)

audit_logs (id, actor_id, action, entity, entity_id, metadata jsonb, created_at)
```

### Why this shape supports future requirements without redesign

- **Commission-ready payments (Decision 1):** `platform_fee_amount` exists and defaults to `0` today. Turning on commission later is a configuration change (set a percentage, populate this field, pass `application_fee_amount` to Stripe) — not a schema or architecture change.
- **Policy engine (Decision 2):** two-tier table design (`platform_policy_limits` + `cinema_cancellation_policies`) means the admin ceiling and owner-configured policy are separate rows, validated against each other, rather than one flat "policy" field that would need restructuring to add the admin-limits concept.
- **Cinema onboarding (Decision 3):** `status` on `cinemas` already models `pending_review → approved/rejected`, plus `suspended` for post-approval action. Public browsing/booking queries simply filter `WHERE status = 'approved'` — enforced by RLS, not just application filtering.
- **Multi-staff (Decision 4):** `cinema_staff` is the single authorization join table for *every* human who can touch a cinema, including the owner. This avoids a separate "is this user the owner OR a staff member" branch in every query — one table, one RLS policy pattern, and adding a new role (e.g., "read-only accountant") later is one enum value plus a permissions check, not a new subsystem.
- **Geographic/currency scope (Decision 5):** `currency_code` exists on `cinemas`, `showtimes`, `bookings` now, hardcoded to one value across the app (single default currency, validated in app logic). Multi-currency later means removing that app-level constraint and wiring Stripe's multi-currency support — the columns already exist, so it's not a migration that touches historical data.
- **QR/check-in (Decision 6):** `ticket_reference` is a unique, unguessable UUID separate from the booking's primary key (so the QR payload doesn't leak sequential booking IDs). Check-in is `UPDATE bookings SET status='checked_in', checked_in_at=now() WHERE ticket_reference=$1 AND status='confirmed'` — a single atomic conditional update guarantees a ticket can only be checked in once, even with simultaneous scan attempts, without needing a separate lock.
- **Notifications (Decision 12):** modeled as records with a `channel` enum, not just "send an email" function calls scattered through the codebase. Adding SMS/push later means adding an enum value and a new sender implementation behind the same interface — the booking/payment code that *triggers* notifications doesn't change.
- **Future extensibility (Decision 14):** discount codes, promotions, loyalty, and reviews are deliberately **not** modeled yet — adding empty tables now for unbuilt features would be premature complexity you explicitly asked me to avoid. The schema doesn't preclude them: a `discount_codes` table applied at booking time, or a `reviews` table keyed to `movie_id`, would each be additive, isolated changes when actually needed.
- **Movie catalog governance (Section 11):** `movies` is admin-write-only (enforced by RLS, not just UI hiding); `cinema_movies` is the only table cinema owners can write to for catalog purposes. This keeps the catalog free of duplicate/inconsistent titles across cinemas by construction, and if owner-submission is ever wanted later, it's a new `movie_submissions` table feeding an admin review step — additive, not a change to existing tables.

---

## 4. Authorization Model (Updated)

**Roles, precisely defined:**

| Role | Scope |
|---|---|
| `customer` | Own bookings/account only |
| `cinema_staff` (role=`staff`) | Limited permissions on one specific cinema (e.g., view/manage bookings, check in tickets) per `permissions` jsonb |
| `cinema_staff` (role=`manager`) | Broader permissions on one specific cinema (showtimes, pricing, screens) but not ownership actions (can't delete cinema, can't invite/revoke other staff unless explicitly granted) |
| `cinema_staff` (role=`owner`) | Full permissions on cinema(s) they own; can invite/revoke staff; can own multiple cinemas via multiple `cinema_staff` rows |
| `platform_admin` | Platform-wide: approve/suspend cinemas, manage all users, set global policy limits, view all audit logs |

**Enforcement, still layered (unchanged principle from v1, now with staff granularity):**
1. Middleware: session + base role check.
2. Route Handler: re-checks role **and** looks up the caller's `cinema_staff` row for the specific `cinema_id` in the request — a manager for Cinema A gets rejected server-side if they try to touch Cinema B, regardless of what the UI shows them.
3. RLS: policies join through `cinema_staff` so that even a direct database query is scoped to cinemas the user has an active (`status='active'`) staff row for. This is the change from v1's simpler "owner_id = auth.uid()" policy — RLS now checks staff membership, which is what makes multi-staff and multi-cinema ownership both work under one consistent rule.

---

## 5. Payment Architecture (Updated)

Flow is the same five webhook-driven steps as v1, with two additions:

- **Idempotency**: every PaymentIntent creation call includes an `idempotency_key` (generated client-side per checkout attempt, stored on the `bookings` row before the Stripe call). A retried request with the same key returns Stripe's original result instead of creating a second charge — this is what makes "double-click the pay button" and "network retry" safe by construction, per your requirement.
- **Commission-ready, commission-off**: `application_fee_amount` is passed to Stripe as `0` (or omitted) for now. Nothing about the PaymentIntent creation code changes when a commission is introduced later — only the fee-calculation function's output changes, from a constant zero to a real percentage lookup.

Refund flow now runs through the policy engine: on a cancellation request, the system evaluates `cinema_cancellation_policies` (bounded by `platform_policy_limits`) against the showtime's start time to determine eligibility and refund percentage automatically — never a manual/ad-hoc decision, and never client-asserted.

---

## 6. Project Structure (Updated)

```
/app
  /(public)/movies, /cinemas, /showtimes
  /(customer)/account, /bookings, /tickets/[reference]
  /(owner-staff)/dashboard/[cinemaId]/
      screens, showtimes, bookings, staff, policy, check-in     ← staff invite UI + QR scanner page
  /(admin)/dashboard/
      cinemas, owners, users, policy-limits, audit-logs, stats
  /api/webhooks/stripe
  /api/tickets/[reference]/check-in                              ← NEW: atomic check-in endpoint
/lib
  /db            ← Drizzle schema + client
  /auth          ← Supabase auth helpers, cinema_staff-aware guards
  /payments      ← Stripe client, idempotency handling, fee calculation
  /policy        ← NEW: cancellation/refund eligibility engine
  /ticketing     ← NEW: QR generation + check-in validation
  /notifications ← NEW: channel-abstracted sender (email now, sms/push later)
  /validation    ← Zod schemas
/supabase
  /migrations
  /functions     ← seat-hold sweeper
/tests
  /unit
  /e2e
```

---

## 7. Development Roadmap (Status-Aligned)

**Phase 0 — Foundations — COMPLETE**
Repo, CI/CD, environments, core schema + RLS, base auth, seat-hold expiry endpoint, cancellation helper, and check-in helper.

**Phase 1 — Cinema Onboarding & Staff — COMPLETE**
- Cinema registration flow (owner-submitted), admin review queue, approve/reject/suspend actions.
- `cinema_staff` model: invite flow, role assignment, permission checks in middleware + RLS.
- *Exit criteria: an owner can register a cinema, it stays invisible until admin-approved, and an invited staff member's access is correctly scoped and cannot touch another cinema.*

**Phase 2 — Catalog Management — COMPLETE**
- Platform-level movie management (admin-only creation of the master catalog — see Section 11), cinema-to-movie association, screens/seats configuration, showtimes.
- *Depends on Phase 1.*

**Phase 3 — Customer Browsing — FUNCTIONALLY COMPLETE**
- Discovery, search/filter, SSR showtime pages — filtered to `status='approved'` cinemas only.
- *Depends on Phase 2.*

**Mandatory Gate — Pre-Phase-4 Security Remediation — NEXT**
- Upgrade Next.js and any related dependencies to versions that resolve the audited critical advisories without applying uncontrolled breaking upgrades.
- Remove direct authenticated-client mutation privileges from foundational booking tables. Booking and seat-hold writes must go through narrowly scoped, server-controlled transactional operations.
- Enforce seat/showtime/screen/cinema consistency at the database boundary; do not trust related IDs supplied by the client.
- Redesign the maximum-eight-seats rule so the database derives and enforces it safely under concurrency; a client-controlled grouping/session value is not authoritative.
- Re-audit all booking-related RLS policies, grants, security-definer functions, triggers, Realtime exposure, cron authorization, and service-role usage after remediation.
- Add regression tests that demonstrate each finding is no longer exploitable, including concurrent transactions and cross-cinema attempts.
- Re-run the complete validation suite on a fresh isolated database and record evidence in the remediation PR.

*Gate exit criteria: zero unresolved critical/high findings affecting the Phase 4 trust boundary; dependency audit reviewed; fresh migrations succeed; unit, integration/RLS, concurrency, lint, typecheck, build, and focused manual security tests pass; the remediation PR is reviewed and merged into `main`; updated `main` is re-audited before Phase 4 begins.*

**Phase 4 — Seat Selection & Booking Core — BLOCKED BY SECURITY GATE**
- Server-authoritative availability query and seat map.
- Atomic hold command with a 10-minute expiry, authenticated ownership, and no cross-showtime/cross-cinema seat injection.
- Database-enforced uniqueness for active held/booked seats and transaction-safe enforcement of the eight-seat maximum.
- Safe release/expiry behavior and narrowly scoped Realtime subscriptions that expose no private booking or user data.
- Booking draft creation and ownership checks; totals are calculated from trusted showtime/pricing data, never accepted from the client.
- *Depends on Phase 3 and successful completion of the mandatory security gate.*
- *Exit criteria: concurrent requests cannot double-book or bypass the seat cap; users cannot mutate another user's holds/bookings; invalid relational combinations fail at the database boundary; expiry and retry behavior are deterministic; complete automated and manual verification passes.*

**Phase 5 — Payments & Policy Engine**
- Stripe Connect onboarding, idempotent PaymentIntent flow, webhooks, the cancellation/refund policy engine (global limits + per-cinema policy + automatic eligibility evaluation), refund execution.
- *Depends on Phase 4.*
- Payment amounts, currency, cinema destination, fees, and refund eligibility must be calculated server-side. Webhook signatures, event idempotency, ordering, replay handling, and transactional booking-state transitions are mandatory exit criteria.

**Phase 6 — Ticketing & Check-in**
- QR ticket generation on confirmation, customer-facing ticket view, staff check-in scanner UI, atomic single-use validation.
- *Depends on Phase 5 (needs confirmed bookings to ticket).*

**Phase 7 — Notifications**
- Notification abstraction + Resend email implementation for all required events (confirmation, payment, cancellation, refund, ticket delivery, booking changes).
- *Can run in parallel with Phase 6, both depend on Phase 5.*

**Phase 8 — Admin Platform Tools**
- Full admin dashboard: owners/staff/cinemas management, global policy-limit configuration, platform-wide stats, audit log viewer.
- *Depends on Phases 1, 5, 6 having real data to manage/report on.*

**Phase 9 — Hardening**
- Rate limiting, security review, accessibility audit, load test specifically on seat-hold and check-in concurrency paths, legal pages.

> Phase 9 is a final hardening pass, not a reason to defer known security defects. Security gates are required at every phase boundary, especially before booking and payments.

**Phase 10 — Production Launch**

**Phase 11 — Post-launch**
- Statistics refinement, performance tuning, backup/DR drills, groundwork for future features (discount codes, multi-currency) evaluated against real usage data rather than speculatively.

---

## 8. Testing Strategy (Updated additions)

- **Staff authorization tests**: verify a `manager`/`staff` role genuinely cannot exceed granted permissions, and cannot access a different cinema even with a valid session.
- **Policy engine unit tests**: table-driven tests covering "cinema policy more lenient than platform limit" (should be rejected at write-time), boundary conditions on cancellation windows.
- **Check-in concurrency test**: simulate two simultaneous scans of the same QR code; exactly one must succeed.
- **Idempotency test**: fire the same payment request twice with the same idempotency key; verify exactly one booking/charge results.
- Everything from v1 (RLS integration tests, seat-hold race tests, Stripe test-mode payment matrix, Playwright E2E journeys) still applies.

---

## 9. Deployment Strategy

Unchanged from v1.

---

## 10. Security Findings, Risks, and Engine Guardrails

### Blocking findings from the 2026-09-09 pre-Phase-4 audit

1. **Critical dependency exposure:** the installed Next.js baseline has reported critical vulnerabilities. Pin and upgrade deliberately, inspect the changelog, regenerate the lockfile through the package manager, and rerun the full suite. Never use a blind force-upgrade as proof of remediation.
2. **Over-broad booking-table privileges:** authenticated users have direct PostgREST insert/update capability over foundational booking tables. RLS alone must not turn an untrusted client into the booking transaction coordinator. Revoke broad writes and expose minimal server-owned/RPC operations with fixed inputs and explicit authorization.
3. **Missing relational integrity checks:** current protections do not fully prove that a selected seat belongs to the showtime's screen or that the showtime/screen/cinema combination is consistent. Enforce these relationships in database constraints or carefully reviewed transactional functions.
4. **Bypassable and race-prone seat cap:** the maximum-eight-seats rule is influenced by client-controlled data and its trigger approach is unsafe under concurrent requests. The authoritative grouping must be server/database derived, locked consistently, and tested with simultaneous transactions.

These findings are release blockers, not backlog polish. The implementing engine must first inspect the complete audit and current SQL/code; this summary must not be treated as a substitute for the exact evidence and affected objects in the audit.

### Non-negotiable implementation guardrails

- Never trust client-supplied `user_id`, `cinema_id`, price, currency, fee, role, permission, booking status, or ownership fields.
- Do not solve database authorization defects only by hiding UI controls or adding middleware. Preserve layered enforcement: server guard + least-privilege grants + RLS + relational constraints/transactional functions.
- Security-definer functions must use a safe fixed `search_path`, explicit schema qualification, least privilege, and revoked public execution unless intentionally granted.
- Service-role credentials stay server-only and must not be used to bypass tenant checks in ordinary application flows.
- Realtime publication/policies must expose only the minimum seat-availability state needed by the client—not user IDs, private holds, booking records, or payment data.
- Cron and webhook endpoints require strong authentication/signature verification, replay resistance where applicable, safe failure behavior, and no secrets in logs.
- Every tenant-scoped mutation must include a negative cross-cinema/IDOR test and every state transition must reject invalid prior states.
- Integration tests remain restricted to the approved isolated databases `cinema_platform_test` and `cinema_platform_ci`; never point destructive tests at development, staging, or production.
- Do not weaken tests, RLS, constraints, or grants merely to make a new feature pass.

### Continuing architectural risks

- **Permission model complexity**: `permissions jsonb` on `cinema_staff` gives flexibility but needs disciplined validation (a fixed, documented set of permission keys) to avoid becoming an unauditable free-for-all — recommend starting with a small fixed permission set per role rather than fully free-form JSON, and only widening it if a real need appears.
- **Policy engine edge cases**: cinema policy validation against platform limits must be enforced at write-time (not just documented) — a missing DB-level CHECK/trigger would let bad data in if application validation is ever bypassed.
- **QR ticket security**: `ticket_reference` must be unguessable (UUID, not sequential) and check-in endpoints must be authenticated as cinema staff for that specific cinema — an unauthenticated or cross-cinema check-in endpoint would be a real fraud vector.
- **Currency hardcoding discipline**: keeping "single currency" enforced in application logic (not schema) means a future developer could accidentally introduce multi-currency inconsistently; worth a single well-documented app-level constant/config rather than scattered assumptions.

---

## 11. Confirmed Defaults

The following are now confirmed (not just proposed defaults) and are reflected in the schema and roadmap below:

1. **Seat-hold expiry: 10 minutes.** Implemented as `seat_holds.expires_at = created_at + interval '10 minutes'` at insert time, with the sweeper job (Section 3/7) releasing expired holds. Stored as a single named constant in `/lib/policy` (not scattered through the codebase) so it can become a platform-configurable setting later — e.g. moved into `platform_policy_limits` — without touching call sites.
2. **Maximum seats per booking: 8.** This is the confirmed business rule. At the audited baseline, its enforcement is not yet trustworthy because grouping input can be client-influenced and the trigger is race-prone. The remediation gate must make the database derive the authoritative booking/hold scope and enforce the limit safely under concurrent transactions. Keep `8` as one named configuration point so it can later move into `platform_policy_limits` without redesign.
3. **Movie catalog creation: Platform Administrator only.** This is a tightening from the v2 draft (which floated owner-submission). The `movies` table is now write-restricted to `platform_admin` in both RLS policy and application logic — cinema owners have **no** path to create or edit a `movies` row, only to `INSERT`/`DELETE` rows in `cinema_movies` (their own selection of which existing catalog titles their cinema shows). This is simpler than the previous draft, removes an entire approval-queue workflow from scope, and is fully reversible later: if you decide to allow owner-submitted movies, that's an additive `movie_submissions` table + admin review step, not a change to the existing `movies`/`cinema_movies` relationship.

All three remain simple, named configuration points rather than hardcoded magic numbers/rules buried in logic, specifically so each can graduate to a database-backed, admin-editable setting later without a redesign.

---

## 12. Immediate Next Actions

1. Fetch and verify the latest `main`; do not assume the audited SHA is still current.
2. Open a dedicated remediation branch from that verified commit.
3. Read the complete pre-Phase-4 audit and map every finding to affected migrations, grants, policies, functions, application call sites, and regression tests.
4. Implement the dependency and booking-boundary fixes without starting Phase 4 feature work.
5. Validate on a fresh isolated database, run the full suite, perform targeted concurrency and authorization tests, and document evidence.
6. Merge only after review and green CI; then perform a focused re-audit of the new `main`.
7. Begin Phase 4 only if the mandatory gate exit criteria are satisfied.

The Moviera homepage may continue as a separately isolated UI/integration workstream using real Phase 3 data. It must not alter booking security boundaries, claim unavailable features work, or enable Phase 4 actions before the gate passes.

---

**Next step at this revision:** Pre-Phase-4 Security Remediation. Phase 4 remains blocked until the recorded findings are fixed, regression-tested, merged, and re-audited.
