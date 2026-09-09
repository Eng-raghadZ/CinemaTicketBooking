# Environments

Moviera uses separate Development, Staging, and Production environments. Databases, credentials, and Stripe modes must never be shared across them.

| Environment | Purpose | Database/Supabase | Stripe mode | Deployment path |
|---|---|---|---|---|
| Development | Local development and manual testing | Local Supabase CLI or development Supabase project | Test | Local machine / Vercel preview |
| Staging | Integrated testing and demonstrations | Dedicated staging Supabase project | Test | Push to `main`; Vercel integration plus staging migration workflow |
| Production | Real users and real transactions | Dedicated production Supabase project | Live | Published GitHub release; protected production migration environment |

## Local Development

Requirements:

- Node.js 20 or newer. GitHub Actions currently uses Node.js 24.
- npm
- PostgreSQL 16 or a local Supabase CLI stack for database work

Set up the application:

```bash
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

Use only development credentials in `.env.local`. The file is gitignored and must never be committed.

## Environment Variables

The authoritative list and explanations are in `.env.example`.

Public browser configuration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Server-only secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `DATABASE_URL_SERVICE_ROLE`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CRON_SECRET`
- `SENTRY_AUTH_TOKEN`

`SENTRY_DSN` may be exposed only according to the final Sentry client/server configuration. Never rename a secret with a `NEXT_PUBLIC_` prefix unless the value is explicitly designed for browser exposure.

## Database Connections

- `DATABASE_URL` is used by the migration runner.
- `DATABASE_URL_SERVICE_ROLE` is used by trusted server-side Drizzle operations.
- At runtime, use the Supabase pooled/Supavisor connection configuration required by the deployment environment.
- One-off migration jobs may use the environment's direct database connection.
- Never use a production connection in local development or tests.

## Isolated Integration-Test Databases

Integration tests truncate and rebuild fixture data. They may run only against a database named:

- `cinema_platform_test`, or
- `cinema_platform_ci`.

Required connections:

- `TEST_DATABASE_URL`: administrative connection for fixture setup and test migrations.
- `APP_DATABASE_URL`: ordinary non-superuser connection using the `app_test` login so RLS behavior is tested genuinely.

The test helper rejects any database name outside the allowlist above.

Typical local preparation:

```bash
psql "$TEST_DATABASE_URL" -f tests/integration/fixtures/local-auth-shim.sql
npm run db:migrate:test
psql "$TEST_DATABASE_URL" -f tests/integration/fixtures/local-auth-grants.sql
npm run test:integration
```

Never point `TEST_DATABASE_URL` or `APP_DATABASE_URL` at the development `postgres` database, staging, or production.

## Pull Requests and CI

Every pull request targeting `main`, and every push to `main`, runs `.github/workflows/ci.yml`:

- lint and typecheck;
- unit tests;
- integration tests against a fresh PostgreSQL 16 service database named `cinema_platform_ci`;
- production build after the earlier jobs pass.

CI creates the non-superuser `app_test` login, applies the local auth shim, runs all migrations, applies the post-migration grants fixture, and then executes the integration suite.

Vercel preview deployments should use isolated/non-production Supabase data. Do not point preview deployments at the production database.

## Staging Deployment

A push to `main` triggers:

1. the normal CI workflow;
2. Vercel application deployment through its GitHub integration;
3. `.github/workflows/deploy-migrations.yml`'s staging migration job using `STAGING_DATABASE_URL` and the protected `staging` GitHub Environment.

Repository administrators must configure the required staging secret before relying on automatic migration deployment.

## Production Deployment

The current migration workflow is triggered by a **published GitHub release**, not merely by creating or pushing a Git tag.

When a release is published:

1. `migrate-production` targets the protected `production` GitHub Environment;
2. configured required reviewers must approve the job;
3. migrations run using `PRODUCTION_DATABASE_URL`;
4. the application deployment/promotion remains the responsibility of the configured Vercel GitHub integration and release process.

Before a production release, verify the GitHub Environment protection rules and secrets manually. Documentation does not prove those repository settings are configured.

## Migration Safety

- Migrations are applied in filename order from `supabase/migrations`.
- Never edit an already-deployed migration; add a new forward-only migration.
- Test both fresh installation and incremental upgrade from the current deployed baseline.
- Destructive schema or data changes require an explicit preservation, rollback, and recovery plan.
- A successful application build does not prove migrations were deployed successfully; inspect the migration workflow separately.

## Secret Handling

- Local secrets belong in `.env.local` only.
- CI/deployment secrets belong in protected GitHub, Vercel, or Supabase configuration.
- Never commit real values, paste them into logs, screenshots, issues, pull requests, or documentation.
- Use distinct credentials for Development, Staging, and Production.
- Rotate a credential immediately if it is accidentally exposed.
