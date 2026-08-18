# Phase 1 — Cinema Onboarding & Staff

This documents what Phase 1 adds on top of the verified Phase 0 foundations
(schema, RLS, guards, migrations — all unchanged by this phase).

## What already existed from Phase 0 (not re-touched)

Phase 0 deliberately laid the groundwork this phase needed:
- `cinemas.status` lifecycle (`pending_review → approved/rejected`, `suspended`)
- `cinemas_enforce_initial_status` / `cinemas_enforce_status_change_admin_only`
  triggers (0004) — the actual, database-level guarantee that a cinema can't
  self-approve
- `cinema_staff` table + RLS (0001, 0005) and `can_manage_cinema_staff` /
  `is_active_cinema_staff` helper functions (0003)
- `requireAuthenticatedUser` / `requirePlatformAdmin` / `requireCinemaStaff`
  guards (`lib/auth/guards.ts`)
- Integration tests already exercising self-approval blocking, cross-tenant
  isolation, and admin approval (`tests/integration/rls-and-constraints.test.ts`)

Phase 1 is the missing **application layer** on top of that: the actual
registration form, admin review queue, and staff invite/accept/revoke flows.
No schema or RLS changes were needed or made.

## What Phase 1 adds

| Area | Files |
|---|---|
| Validation | `lib/validation/cinema.ts`, `lib/validation/staff.ts` |
| Permission logic (pure, unit-tested) | `lib/auth/permissions.ts` |
| Server Actions | `lib/actions/cinemas.ts`, `lib/actions/staff.ts` |
| Owner-facing UI | `app/(owner-staff)/dashboard/register/*`, `app/(owner-staff)/dashboard/page.tsx`, `app/(owner-staff)/dashboard/[cinemaId]/staff/*` |
| Admin-facing UI | `app/(admin)/dashboard/cinemas/*` |
| Tests | `tests/unit/permissions.test.ts`, `tests/unit/validation-cinema.test.ts`, `tests/unit/validation-staff.test.ts` |

### Cinema registration

`registerCinema` (Server Action) inserts a `cinemas` row as the authenticated
user via their own RLS-scoped Supabase client — never service-role. The
insert deliberately omits `status`; the 0004 trigger forces
`pending_review` for any non-admin caller regardless of what's sent, so
there is no code path in this phase that can bypass admin review.

### Admin review queue

`/dashboard/cinemas` (admin-only, `requirePlatformAdmin`) lists cinemas by
status with tabs. `/dashboard/cinemas/[cinemaId]` shows the full record and
renders the action(s) valid for its current status:
`pending_review → approve | reject`, `approved → suspend`,
`suspended → reinstate`. Every action writes an `audit_logs` row via the
service-role client (`lib/db/client.ts`'s `serviceDb()`), since `audit_logs`
has no RLS write policy for `authenticated` by design (docs/security.md).

### Staff invite / accept / revoke

- **Invite** (`inviteStaff`): caller must be active staff on the target
  cinema (`requireCinemaStaff`) *and* pass `canManageCinemaStaff` — the pure,
  unit-tested mirror of the SQL `can_manage_cinema_staff` function. Invites
  resolve the invitee by email via the service-role client (RLS on `users`
  only allows reading your own row), then insert a `cinema_staff` row with
  `status: 'invited'`. Role `owner` cannot be granted through this path —
  ownership is exclusively created by the `0008_cinema_owner_bootstrap.sql`
  trigger at cinema-creation time.
- **Accept** (`acceptStaffInvite`): the invited user flips their own row to
  `active`; authorized by the existing `cinema_staff_update` RLS policy
  (`user_id = auth.uid()`), not by any new database logic.
- **Revoke** (`revokeStaffAccess`): same `canManageCinemaStaff` check as
  invite, sets status to `revoked`.

**No invite emails yet.** Sending an actual email requires the
channel-abstracted notification sender, which is explicitly Phase 7 in
architecture-plan.md ("Notification abstraction + Resend email
implementation... can run in parallel with Phase 6, both depend on Phase
5"). For now, invited users see and accept pending invites from their own
`/dashboard` the next time they sign in. Wiring `lib/notifications` in later
is additive, not a redesign — the same pattern the architecture doc already
uses for QR/check-in.

### Fixed permission vocabulary

`cinema_staff.permissions` is `jsonb` for forward compatibility, but
architecture-plan.md Section 10 flags free-form JSON permissions as an
audit risk and recommends a small, fixed set. `STAFF_PERMISSION_KEYS` in
`lib/validation/staff.ts` is that fixed vocabulary, enforced via Zod
`.strict()` so an unrecognized key is rejected at the application layer
before it ever reaches the database.

## Exit criteria check (architecture-plan.md, Phase 1)

- ✅ An owner can register a cinema, and it stays invisible (not
  `approved`) until admin-approved — enforced by the 0004 trigger, already
  covered by the "forced to pending_review" integration test, and now
  reachable through an actual form.
- ✅ An invited staff member's access is correctly scoped and cannot touch
  another cinema — enforced by `requireCinemaStaff` (layer 2) and RLS
  (layer 3), already covered by the "staff role member cannot write to
  another cinema's screens" integration test.

## Deliberately deferred to later phases

- Invite emails → Phase 7 (notifications)
- Movie catalog / screens / showtimes management UI → Phase 2
- Admin dashboard for owners/users/policy-limits/audit-log viewer → Phase 8
  (this phase's admin UI is scoped to cinema review only, per the roadmap)
