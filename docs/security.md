# Security Reference (Phase 0 foundations)

This documents what's actually implemented as of Phase 0, for reviewers who
want to verify claims against code rather than prose.

## Layered authorization (three independent layers)

1. **Middleware** (`middleware.ts`) — redirects unauthenticated requests away
   from protected route groups. Coarse only; does not know about cinemaId.
2. **Route Handler guards** (`lib/auth/guards.ts`) — `requireAuthenticatedUser`,
   `requirePlatformAdmin`, `requireCinemaStaff(cinemaId, { minRole })`. Every
   Route Handler under `/(owner-staff)` and `/(admin)` must call one of these
   before touching data, using the `cinemaId` from the URL param — never from
   the request body.
3. **Row Level Security** (`supabase/migrations/0005_rls_policies.sql`) — the
   database-level backstop. Enabled on every table. Default-deny: a table
   with RLS on and no matching policy denies the operation outright, even to
   a query that got past layers 1 and 2 by mistake.

Layers 2 and 3 are independently correct — layer 3 is not a "just in case,"
it's load-bearing, verified in `tests/integration/rls-and-constraints.test.ts`
by literally trying to cross tenant boundaries as different simulated users
and asserting failure.

## Non-recursive RLS via SECURITY DEFINER

Policies that need to check `cinema_staff` membership (e.g. "is this user
staff for this cinema?") do so through `SECURITY DEFINER` helper functions
(`supabase/migrations/0003_rls_helper_functions.sql`) rather than inline
subqueries, specifically to avoid infinite recursion when a policy *on*
`cinema_staff` needs to check `cinema_staff` membership. This is the standard
documented Postgres/Supabase pattern, not a shortcut.

## Column/transition-level guards beyond RLS

RLS controls *which rows* a role can touch, not *which columns* or *which
state transitions*. Two places needed more than that
(`supabase/migrations/0004_status_transition_guards.sql`):

- A cinema owner can UPDATE their own cinema row (name, description,
  location) but a trigger blocks them from also flipping `status` to
  `approved` in the same statement — only `platform_admin` (or trusted
  service-role code) may change `status`/`reviewed_by`/`reviewed_at`.
- Cinema staff can UPDATE a booking to check it in, but a trigger blocks them
  from also rewriting `total_amount`, `stripe_payment_intent_id`, or any
  other financial field in that same UPDATE.

## No self-escalation

There is no INSERT/UPDATE RLS policy on `user_roles` for `authenticated` or
`anon` at all — role assignment happens exclusively via the service-role
`handle_new_auth_user` trigger (new users start as `customer`) or trusted
admin tooling. Verified in the "No self-escalation via user_roles" test.

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL_SERVICE_ROLE` are server-only,
  never prefixed `NEXT_PUBLIC_`, and only read by `lib/db/client.ts`
  (scheduled jobs, webhook handler). Grep the codebase for
  `SERVICE_ROLE`/`serviceDb` before adding a new caller — if it's reachable
  from user input, it almost certainly shouldn't use this client.
- All other secrets are listed with explanation in `.env.example`.

## Known gaps / explicitly deferred (not silently skipped)

- Stripe integration itself: no payment code exists yet (Phase 5).
- Rate limiting on auth/booking endpoints: deferred to Phase 9 (Hardening) —
  tracked, not forgotten.
- The `permissions` jsonb column on `cinema_staff` is present in the schema
  but no fixed permission-key vocabulary is enforced yet beyond `owner`/
  `manager`/`staff` role tiers — flagged as a risk in the architecture doc
  (Section 10), to be tightened before staff invitations ship in Phase 1.
