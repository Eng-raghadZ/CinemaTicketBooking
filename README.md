# Multi-Cinema Booking Platform

Phase 0 foundations, per Architecture & Roadmap v2. See `docs/` for details.

## Quick start (local development)

```bash
cp .env.example .env.local   # fill in your dev Supabase project + Stripe test keys
npm install
npm run db:migrate            # applies supabase/migrations/*.sql
npm run dev
```

## Testing

```bash
npm test                                              # unit tests (no DB required)
npm run test:integration                              # RLS + constraint tests (needs Postgres — see below)
npm run lint
npm run typecheck
```

Integration tests need a real Postgres instance and, if it's not a real
Supabase project, the local auth shim that reproduces `auth.uid()`/`auth.jwt()`:

```bash
psql "$DATABASE_URL" -f tests/integration/fixtures/local-auth-shim.sql
npm run db:migrate
psql "$DATABASE_URL" -f tests/integration/fixtures/local-auth-grants.sql
TEST_DATABASE_URL=... APP_DATABASE_URL=... npm run test:integration
```

`APP_DATABASE_URL` must connect as a **non-superuser** role (see
`docs/security.md` for why) — the repo assumes a role named `app`.

## Structure

See `docs/environments.md` for environment setup and `docs/security.md` for
the authorization model, both written to be checked against the actual code
rather than taken on faith.
