# Moviera — Multi-Cinema Booking Platform

Moviera is a multi-cinema ticket-booking platform built with Next.js, Supabase, PostgreSQL, and TypeScript. It supports customers, cinema owners and staff, and platform administrators through layered application and database authorization.

## Current Project Status

Phases 0–3 are functionally complete and merged into `main`:

- Phase 0: foundations, authentication, database schema, RLS, CI/CD, and test infrastructure.
- Phase 1: cinema onboarding, administrative review, and cinema-scoped staff management.
- Phase 2: platform movie catalog, cinema movie selection, screens, seats, showtimes, and pricing.
- Phase 3: public cinema, movie, and showtime browsing.

Phase 4 — Seat Selection and Booking Core — has not started. It is blocked by the mandatory Pre-Phase-4 Security Remediation Gate documented in [`docs/architecture-plan.md`](docs/architecture-plan.md).

Before starting a new phase or major workstream, fetch and inspect the latest `main`, confirm it matches `origin/main`, and treat the repository and its complete migration history as the implementation source of truth.

## Technology Stack

- Next.js 15 App Router with TypeScript
- React 18
- Supabase Auth, PostgreSQL, RLS, Realtime, and Storage
- Drizzle ORM
- Zod validation
- Vitest unit and PostgreSQL integration tests
- Stripe and Stripe Connect planned for the payment phase
- Resend planned for notification delivery
- Vercel and GitHub Actions

## Local Development

Requirements:

- Node.js 20 or newer
- npm
- A development Supabase project or a local Supabase CLI stack

Create the local environment file and install dependencies:

```bash
cp .env.example .env.local
npm install
```

Fill `.env.local` with development-only values. Never commit this file or real secrets.

Apply database migrations and start the application:

```bash
npm run db:migrate
npm run dev
```

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Integration Tests

Integration tests are destructive and must run only against an isolated database named:

- `cinema_platform_test`, or
- `cinema_platform_ci`

They require both:

- `TEST_DATABASE_URL`: an administrative connection used for fixtures.
- `APP_DATABASE_URL`: a connection using the ordinary non-superuser `app_test` role so RLS is genuinely exercised.

Typical local sequence:

```bash
psql "$TEST_DATABASE_URL" -f tests/integration/fixtures/local-auth-shim.sql
npm run db:migrate:test
psql "$TEST_DATABASE_URL" -f tests/integration/fixtures/local-auth-grants.sql
npm run test:integration
```

The integration-test helper refuses to operate on database names outside the approved test allowlist. Never point these commands at development, staging, or production data.

## Documentation

- [Architecture, roadmap, current status, and phase gates](docs/architecture-plan.md)
- [Security model](docs/security.md)
- [Environment setup](docs/environments.md)
- [Phase 1 — Cinema onboarding and staff](docs/phase1-cinema-onboarding-and-staff.md)
- [Phase 2 — Catalog management](docs/phase2-catalog-management.md)
- [Phase 3 — Customer browsing](docs/phase3-customer-browsing.md)
- [Authorization hardening](docs/authorization-hardening.md)

## Security Notice

Do not begin Phase 4 until the pre-Phase-4 remediation findings are fixed, regression-tested, merged into `main`, and re-audited. In particular, booking and seat-hold operations must be server-authoritative, transaction-safe, tenant-scoped, and enforced at the database boundary rather than relying on UI controls or client-supplied relationships.

## Repository Workflow

Start work only from an updated, clean `main`:

```bash
git switch main
git pull --ff-only origin main
git status -sb
git rev-parse HEAD
```

Create a dedicated branch for each isolated workstream. Do not combine UI previews, documentation updates, security remediation, and feature development in the same commit or pull request.
