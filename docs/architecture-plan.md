# Multi-Cinema Booking Platform — Architecture & Roadmap (v3)

*Updated after the verified completion and merge of Phase 0 and Phase 1. This version incorporates the implemented authentication routes, cinema onboarding workflow, fixed staff-permission vocabulary, database-level staff update protections, migrations `0009`–`0012`, and the current GitHub repository state.*

This document is the architectural source of truth for the `Eng-raghadZ/CinemaTicketBooking` repository. It distinguishes between **implemented and verified behavior** and **planned future work** so that developers and AI coding agents do not mistake foundational schema or helper modules for completed user-facing features.

---

## 0. Current Repository State

**Repository:** `https://github.com/Eng-raghadZ/CinemaTicketBooking`

**Authoritative branch:** `main`

**Verified implementation baseline:** merge commit `85c1a295166399cdaf4a2a16afdfd376f35488ac`

| Phase | Status | Current meaning |
|---|---|---|
| Phase 0 — Foundations | **Complete and verified** | Core schema, RLS, authentication foundation, CI/CD, test infrastructure, and selected future-facing domain helpers are present. |
| Phase 1 — Cinema Onboarding & Staff | **Complete, verified, and merged** | Authentication UI, cinema registration/review, and staff invitation/access management are operational. |
| Phase 2 — Catalog Management | **Not implemented on `main`** | The database foundation may exist, but the application layer for movies, screens, seats, and showtimes is not present. |
| Phase 3 onward | **Planned** | No phase should be treated as implemented merely because a supporting table, policy, or helper exists. |

Before starting any new phase, an implementation agent **must inspect the latest `main` branch and its full migration history**. Standalone ZIP files, old conversation artifacts, and earlier generated code are reference material only until reconciled with the current repository.

---

## 1. System Architecture (Updated)

The infrastructure remains based on Next.js, Supabase, PostgreSQL, and Vercel. Authorization is intentionally enforced in layers rather than delegated to the UI.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                         Next.js 15 (Vercel)                         │
│  Public site │ Auth │ Customer area │ Owner/Staff │ Platform Admin │
│  Server Components │ Server Actions │ Route Handlers              │
│  /lib/auth │ /lib/policy │ /lib/ticketing                         │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                 ┌─────────────▼─────────────┐
                 │      Supabase Platform    │
                 │ PostgreSQL + Auth + RLS   │
                 │ Realtime + Storage        │
                 └─────────────┬─────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐   ┌─────────▼────────┐   ┌────────▼────────┐
│ Scheduled jobs │   │ Stripe Connect   │   │ Resend          │
│ Hold expiry    │   │ Planned Phase 5  │   │ Planned Phase 7 │
└────────────────┘   └──────────────────┘   └─────────────────┘
```

### Logical modules

- **Authentication and authorization:** Supabase Auth, server helpers, route guards, permission checks, RLS policies, and database triggers.
- **Policy engine:** isolated cancellation/refund eligibility logic in `/lib/policy`. Its pure logic foundation exists; the full policy-management and refund workflow remains Phase 5 work.
- **Ticketing and check-in:** atomic check-in helper foundation in `/lib/ticketing`. QR delivery and scanner UI remain Phase 6 work.
- **Seat-hold expiry:** database support and a scheduled release endpoint exist. The complete customer seat-selection journey remains Phase 4 work.

---

## 2. Technology Stack

| Layer | Choice | Current status |
|---|---|---|
| Web framework | Next.js 15, App Router, TypeScript | Implemented |
| UI rendering | React Server Components with client components where interaction is required | Implemented pattern |
| Database | PostgreSQL through Supabase | Implemented |
| ORM/schema mirror | Drizzle ORM | Implemented |
| Authentication | Supabase Auth | Implemented |
| Authorization | Middleware/guards + Server Actions/Route Handlers + PostgreSQL RLS/triggers | Implemented foundation and Phase 1 rules |
| Validation | Zod | Implemented for Phase 1; extend per phase |
| Realtime | Supabase Realtime | Planned for live seat state |
| Object storage | Supabase Storage | Planned for posters and media |
| Payments | Stripe + Stripe Connect | Planned for Phase 5 |
| Email | Resend with a notification abstraction | Planned for Phase 7 |
| QR generation | `qrcode`, server-side signed/unguessable ticket payload | Planned for Phase 6 |
| Unit/integration tests | Vitest | Implemented |
| End-to-end tests | Playwright | Planned |
| Deployment | Vercel + Supabase + GitHub Actions | CI/CD foundation implemented |

---

## 3. Database Architecture

The SQL files in `/supabase/migrations` are the authoritative database definition. `/lib/db/schema.ts` must remain synchronized with them. Before adding or changing a table, inspect all migrations `0001`–`0012`; do not create duplicate tables simply because Phase 2 application code is absent.

```sql
-- USERS AND PLATFORM ROLES
users (id, email, created_at, ...)
user_roles (user_id -> users, role: customer|cinema_owner|cinema_staff|platform_admin)

-- CINEMA-SCOPED AUTHORIZATION
cinema_staff (
  id, cinema_id -> cinemas, user_id -> users,
  role: owner|manager|staff,
  permissions jsonb,
  invited_by -> users,
  status: invited|active|revoked,
  created_at
)
  -- UNIQUE (cinema_id, user_id)
  -- owners, managers, and staff share one cinema-scoped authorization path

-- CINEMAS
cinemas (
  id, primary_owner_id -> users,
  name, description, location,
  status: pending_review|approved|suspended|rejected,
  reviewed_by -> users, reviewed_at, rejection_reason,
  country_code, currency_code,
  created_at
)

-- CATALOG FOUNDATION
screens (id, cinema_id -> cinemas, name, layout_config jsonb)
seats (id, screen_id -> screens, row, number, seat_type)
movies (id, title, description, poster_url, duration_minutes, rating, ...)
cinema_movies (cinema_id -> cinemas, movie_id -> movies)
showtimes (id, cinema_id, screen_id, movie_id, starts_at, base_price, currency_code)

-- BOOKING FOUNDATION
seat_holds (id, showtime_id, seat_id, user_id, expires_at, status)
bookings (
  id, user_id, cinema_id, showtime_id, status,
  stripe_payment_intent_id, idempotency_key,
  total_amount, platform_fee_amount, currency_code,
  ticket_reference, checked_in_at, checked_in_by,
  created_at
)
booking_seats (booking_id -> bookings, seat_id -> seats)

-- POLICY, PAYMENTS, NOTIFICATIONS, AND AUDIT FOUNDATION
platform_policy_limits (...)
cinema_cancellation_policies (...)
payments (...)
notifications (...)
audit_logs (...)
```

### Important implementation distinction

The presence of a table or foundational helper does **not** complete its roadmap phase. For example:

- Catalog tables do not mean Catalog Management is complete.
- `seat_holds` and the expiry endpoint do not mean seat selection is complete.
- payment columns do not mean Stripe is integrated.
- ticket/check-in fields do not mean QR tickets and scanner UI are complete.
- notification records do not mean Resend delivery is implemented.

### Phase 1 security migrations

The current migration history includes the following post-foundation refinements:

| Migration | Purpose |
|---|---|
| `0009_staff_profile_visibility.sql` | Allows authorized cinema staff managers to read the basic staff records required by the staff-management interface. |
| `0010_cinema_staff_update_guards.sql` | Adds database-level update protections for `cinema_staff`, preventing identity changes, cinema reassignment, owner mutation, and unauthorized privilege escalation. |
| `0011_invited_staff_cinema_visibility.sql` | Allows an invited user to view the cinema associated with their pending invitation. |
| `0012_allow_revoked_staff_reinvite.sql` | Allows a revoked member to be re-invited with a newly selected role and permission set while retaining the protections introduced by migration `0010`. |

---

## 4. Authentication and Authorization Model

### Platform and cinema-scoped roles

| Role | Scope |
|---|---|
| `customer` | Own profile, bookings, and tickets only. Customer functionality is planned for later phases. |
| `staff` in `cinema_staff` | Limited access to one cinema according to the fixed role scope and allowed operations. |
| `manager` in `cinema_staff` | Broader cinema management capabilities according to assigned permissions. |
| `owner` in `cinema_staff` | Full control of the associated cinema and staff-management authority; a user may own multiple cinemas. |
| `platform_admin` | Platform-wide cinema review and future platform-management capabilities. |

### Fixed permission vocabulary

`permissions` is stored as JSONB for extensibility, but it is **not free-form JSON**. The application must accept only the documented keys defined by `STAFF_PERMISSION_KEYS`:

```text
manage_staff
manage_showtimes
manage_pricing
manage_screens
view_bookings
manage_bookings
check_in_tickets
```

Rules:

- Unknown permission keys must be rejected by validation.
- Permission checks must never trust client-supplied values.
- The `staff` role has a fixed limited scope; manager permissions may be selected only from the vocabulary above.
- An `owner` must not be created through the ordinary staff invitation/update path.
- Expanding the vocabulary requires validation, authorization, documentation, and test updates in the same change.

### Layered enforcement

1. **Middleware/session boundary:** blocks unauthenticated access and performs coarse route-level checks.
2. **Server boundary:** Server Actions and Route Handlers re-check the authenticated user, target cinema membership, membership status, role, and required permission.
3. **Database boundary:** RLS scopes reads/writes to the correct user and cinema; triggers protect sensitive staff fields and status transitions.

UI hiding is convenience only and is never considered authorization.

### Self-escalation gap — resolved

The earlier `cinema_staff` self-escalation risk is considered resolved by migration `0010` and its `enforce_cinema_staff_update_scope` trigger, together with the constrained re-invitation flow in migration `0012`.

Protected behavior includes:

- ordinary users cannot promote a membership to `owner`;
- staff cannot raise their own role or permissions through direct updates;
- membership `user_id` and `cinema_id` cannot be reassigned;
- owner memberships cannot be altered by the ordinary staff update path;
- service-role/platform-admin operations remain explicitly privileged rather than accidentally available through normal RLS writes.

---

## 5. Implemented Phase 1 Workflows

### Authentication

- Login and signup pages.
- Auth callback handling.
- Sign-out flow.
- Safe internal redirects through `safeInternalRedirectPath` to prevent open redirects.
- Signup callback corrected to `/callback`.

### Cinema onboarding

1. An authenticated owner submits a cinema registration.
2. The cinema is created as `pending_review` and is not publicly available.
3. The owner receives the corresponding owner membership through the unified `cinema_staff` model.
4. A platform admin reviews the cinema.
5. Valid transitions are enforced server-side:
   - `pending_review -> approved`
   - `pending_review -> rejected`
   - `approved -> suspended`
   - `suspended -> approved`
6. Administrative actions create audit-log records.

### Staff lifecycle

1. An authorized owner/manager invites an existing user as `manager` or `staff`.
2. Only the intended user can accept the invitation.
3. Active access remains limited to the associated cinema.
4. A non-owner membership may be revoked.
5. A revoked member may be re-invited with a new permitted role/permission selection.
6. Database triggers prevent owner mutation and privilege escalation throughout the lifecycle.

---

## 6. Payment and Policy Architecture (Planned)

Payment remains planned for Phase 5.

- Each checkout attempt will use an idempotency key stored before Stripe PaymentIntent creation.
- Stripe retries with the same key must not create duplicate charges or bookings.
- `platform_fee_amount` keeps the schema commission-ready; commission remains off until explicitly enabled.
- Refund eligibility will be evaluated by the policy engine using platform limits and cinema-specific policies.
- Policy constraints must be enforced at both the application and database boundary.

Existing cancellation-policy code is foundational and tested; it does not represent a complete payment/refund workflow.

---

## 7. Project Structure

The structure below marks implemented areas and planned destinations.

```text
/app
  /(auth)/                                      # IMPLEMENTED — Phase 1
      login/
      signup/
      callback/
      sign-out/
  /(owner-staff)/dashboard/                     # IMPLEMENTED — Phase 1 foundation
      page.tsx
      register/
      [cinemaId]/staff/
      [cinemaId]/screens/                       # PLANNED — Phase 2
      [cinemaId]/showtimes/                     # PLANNED — Phase 2
      [cinemaId]/bookings/                      # PLANNED — later phase
      [cinemaId]/policy/                        # PLANNED — Phase 5
      [cinemaId]/check-in/                      # PLANNED — Phase 6
  /(admin)/dashboard/
      cinemas/                                  # IMPLEMENTED — Phase 1
      movies/                                   # PLANNED — Phase 2
      owners/, users/, policy-limits/, audit-logs/, stats/  # PLANNED
  /(public)/movies, cinemas, showtimes           # PLANNED — Phase 3
  /(customer)/account, bookings, tickets/        # PLANNED — Phases 3–6
  /api/cron/release-expired-seat-holds/          # IMPLEMENTED foundation
  /api/health/                                   # IMPLEMENTED
  /api/webhooks/stripe/                          # PLANNED — Phase 5
  /api/tickets/[reference]/check-in/             # PLANNED — Phase 6

/lib
  /actions                                      # Phase 1 cinema/staff actions implemented
  /auth                                         # Supabase helpers, guards, redirects, permissions
  /db                                           # Drizzle schema, client, migration runner
  /validation                                   # Phase 1 Zod schemas; extend per phase
  /policy                                       # Foundational cancellation logic
  /ticketing                                    # Foundational atomic check-in logic
  /payments                                     # PLANNED — Phase 5
  /notifications                                # PLANNED — Phase 7

/supabase
  /migrations                                   # SQL source of truth, currently 0001–0012
  /functions                                    # Scheduled/background database functions

/tests
  /unit                                         # IMPLEMENTED and passing
  /integration                                  # IMPLEMENTED and passing against isolated test DB
  /e2e                                          # PLANNED

/docs
  environments.md
  security.md
  phase1-cinema-onboarding-and-staff.md
  architecture-plan.md                          # This document should be committed here
```

---

## 8. Development Roadmap

### Phase 0 — Foundations — COMPLETE

- Repository, dependencies, environments, migrations, core schema, RLS, base authentication helpers, CI/CD, and isolated integration-test infrastructure.
- Foundational seat-hold, cancellation-policy, and ticket-check-in helpers were added for later phases.
- **Verification:** unit tests, integration tests, lint, typecheck, build, and GitHub Actions passed.

### Phase 1 — Cinema Onboarding & Staff — COMPLETE

- Authentication UI and callback/sign-out flows.
- Cinema registration and admin review workflow.
- Staff invitation, acceptance, revocation, and constrained re-invitation.
- Fixed permission vocabulary and server-side permission checks.
- RLS visibility refinements and database-level update protections.
- Audit logging for administrative cinema operations.
- **Exit criteria satisfied:** an owner can register a cinema; it remains unavailable until approval; invited staff access is cinema-scoped; cross-cinema access and self-escalation are blocked.
- **Verification:** `44` unit tests and `32` integration tests passed during the Phase 1 sign-off; lint, typecheck, build, and four GitHub Actions checks passed.

### Phase 2 — Catalog Management — NEXT, NOT IMPLEMENTED

- Admin-only master movie catalog CRUD.
- Cinema-to-movie association management.
- Screen creation and safe seat-grid/layout generation.
- Showtime creation, editing, and removal.
- Conflict checks, validation, authorization, RLS/constraints, UI, and tests.
- **Dependency:** verified Phase 1 baseline.

### Phase 3 — Customer Browsing

- Public cinema/movie discovery, search/filter, and SSR showtime pages.
- Only approved cinemas and valid public showtimes may be returned.
- **Dependency:** Phase 2.

### Phase 4 — Seat Selection & Booking Core

- Realtime seat map, atomic holds, expiry/release behavior, booking creation, and maximum-seat enforcement.
- **Dependency:** Phase 3.

### Phase 5 — Payments & Policy Engine

- Stripe Connect onboarding, idempotent PaymentIntents, webhooks, platform fees, policy configuration, cancellation evaluation, and refunds.
- **Dependency:** Phase 4.

### Phase 6 — Ticketing & Check-in

- Signed/unguessable QR tickets, customer ticket view, scanner UI, and atomic single-use validation.
- **Dependency:** confirmed paid bookings from Phase 5.

### Phase 7 — Notifications

- Notification abstraction and Resend implementation for booking, payment, cancellation, refund, ticket, and booking-change events.
- **Dependency:** Phase 5; may progress alongside Phase 6 where safe.

### Phase 8 — Admin Platform Tools

- Full user/owner/staff management, policy limits, audit viewer, and platform statistics.

### Phase 9 — Hardening

- Rate limiting, dependency/security review, accessibility audit, concurrency/load testing, observability, and legal pages.

### Phase 10 — Production Launch

- Production configuration, migration verification, monitoring, rollback plan, smoke tests, and release approval.

### Phase 11 — Post-launch

- Performance refinement, backup/restore drills, analytics improvements, and evidence-based evaluation of promotions, loyalty, reviews, and multi-currency.

---

## 9. Testing Strategy

Every phase must add tests for its own behavior and preserve all earlier passing checks.

- **Unit tests:** validation, permission helpers, pure policy functions, and business rules.
- **Integration tests:** PostgreSQL constraints, RLS isolation, triggers, status transitions, and concurrency-sensitive database behavior.
- **Security tests:** cross-cinema denial, unauthorized role/permission changes, owner-row protection, invitation ownership, and service-role boundaries.
- **E2E tests:** complete role-based workflows once the associated UI phase exists.
- **Build gates:** `npm test`, `npm run test:integration`, `npm run lint`, `npm run typecheck`, and `npm run build`.

Integration tests must run only against an explicitly approved isolated database named `cinema_platform_test` or `cinema_platform_ci`. The test helper must refuse destructive execution against development, staging, or production databases.

The dedicated `app_test` role must remain non-superuser, `NOBYPASSRLS`, and suitable for testing real RLS behavior through the expected Supabase roles.

---

## 10. Deployment and Migration Strategy

- Vercel handles application deployment from GitHub.
- GitHub Actions validates unit tests, integration tests, lint/typecheck, and build.
- Database migrations are applied in filename order from `/supabase/migrations`.
- Staging migrations run against the staging environment.
- Production migrations require the protected production workflow/release path and explicit approval.
- Secrets belong only in local environment files, GitHub environment secrets, Vercel, or Supabase configuration. They must never be committed.
- Schema changes must be additive and backward-compatible where practical; destructive changes require an explicit migration and rollback/data-preservation plan.

---

## 11. Confirmed Defaults and Governance

1. **Seat-hold expiry:** 10 minutes.
2. **Maximum seats per booking:** 8, enforced server-side when Phase 4 is implemented.
3. **Movie creation:** platform-admin only. Cinema owners select from the master catalog through `cinema_movies`; they do not create or edit master movie rows.
4. **Cinema visibility:** only approved cinemas are publicly discoverable/bookable.
5. **Permission vocabulary:** limited to the seven documented `STAFF_PERMISSION_KEYS` until a reviewed change extends it.
6. **Owner creation:** owner memberships are created only through the trusted cinema ownership flow, never through ordinary staff invitation or update operations.
7. **Currency scope:** the application begins with one configured currency while retaining currency columns for future extension.
8. **Commission:** schema-ready but disabled until the payment phase explicitly defines and verifies it.

---

## 12. Known Risks and Required Controls

- **Permission drift:** keep the fixed permission vocabulary synchronized across validation, authorization helpers, UI, documentation, and tests.
- **Schema/application drift:** treat SQL migrations as authoritative and keep Drizzle schema synchronized.
- **Phase-status confusion:** do not label a phase complete because foundational tables or helpers exist.
- **Cross-cinema access:** every cinema-scoped server operation must verify the target membership and rely on RLS as the final boundary.
- **Policy bypass:** future cinema policies must be constrained at database write time as well as in application validation.
- **Seat and check-in races:** use atomic database operations and concurrency tests; UI checks alone are insufficient.
- **Payment duplication:** use Stripe idempotency and webhook-driven state transitions.
- **QR exposure:** use an unguessable ticket reference and authenticate check-in staff against the booking's cinema.
- **Currency inconsistency:** use one central configuration value rather than scattered literals.

---

## 13. Instructions for the Next Implementation Agent

Before beginning Phase 2 or any later phase:

1. Fetch and inspect the latest `main` branch and full repository tree.
2. Read this document, `docs/security.md`, `docs/environments.md`, and the Phase 1 implementation document.
3. Inspect `/supabase/migrations/0001` through `0012` and `/lib/db/schema.ts` before proposing schema changes.
4. Confirm that the worktree is clean and create a dedicated feature branch from current `main`.
5. Treat any older Phase 2 ZIP/artifact as reference only; reconcile it file-by-file with the current security model instead of merging it blindly.
6. Preserve migrations and verified Phase 0/1 behavior unless a required change is documented and tested.
7. Implement the full phase slice: database changes, RLS/constraints, validation, server operations, UI, tests, and documentation.
8. Do not start the following phase until all required checks pass and the current phase is reviewed and merged.

Recommended branch start:

```bash
git switch main
git pull --ff-only origin main
git switch -c phase-2/catalog-management
```

---

## 14. Immediate Next Step

Commit this updated architecture document as `docs/architecture-plan.md`, then begin Phase 2 from the latest `main` branch. Phase 2 must be built or carefully reconstructed against migrations `0001`–`0012`; the earlier standalone artifact is not authoritative until it passes that reconciliation and the complete verification suite.

---

*This v3 document supersedes the earlier architecture draft wherever implementation status, authentication routes, permission vocabulary, Phase 1 security migrations, or the next-phase baseline differs.*
