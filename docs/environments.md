# Environments

Three environments, each with its own Supabase project and its own Stripe
account/mode. Nothing is shared between them — this is what makes it safe to
run migrations or load-test staging without any risk to production data.

| Environment | Purpose | Supabase project | Stripe mode | Deployed from |
|---|---|---|---|---|
| **Development** | Local machine + PR preview deploys | `cinema-platform-dev` (or a local Supabase CLI instance) | Test mode | Any branch (Vercel preview) |
| **Staging** | Pre-production soak testing, demos | `cinema-platform-staging` | Test mode | `main` branch, auto-deploy |
| **Production** | Real users, real money | `cinema-platform-prod` | **Live mode** | Tagged release, manual promotion |

## Local development

1. `cp .env.example .env.local` and fill in your **dev** Supabase project's
   keys and a Stripe **test-mode** key.
2. `npm install`
3. `npm run db:migrate` — applies `/supabase/migrations` against your dev
   database (`DATABASE_URL` in `.env.local`).
4. `npm run dev`

For local database work without a hosted Supabase project, `docker run
postgres:16` or the Supabase CLI's local stack both work — the migrations in
`/supabase/migrations` are guarded (see `0006_auth_sync.sql` and
`0007_roles_and_grants.sql`) to apply cleanly against either.

## Preview deploys

Every pull request gets an isolated Vercel preview deployment. Point preview
deploys at a Supabase **branch database** (Supabase's database branching
feature) rather than the shared dev project, so PR testing never collides
with another developer's local state. CI (`.github/workflows/ci.yml`) runs
lint/typecheck/unit tests/integration tests against a fresh Postgres
container on every PR regardless — the preview deploy is for manual QA.

## Staging → Production promotion

1. Merge to `main` → auto-deploys to staging, migrations auto-apply to the
   staging database.
2. Manual QA / stakeholder review on staging.
3. Tag a release (`git tag vX.Y.Z`) → triggers the production deploy job,
   which requires manual approval in GitHub Actions before migrations run
   against the production database (see `.github/workflows/ci.yml`,
   `deploy-production` job's `environment: production` protection rule).

## Secrets

All secrets are configured per-environment in Vercel's Environment Variables
UI (or GitHub Actions repo/environment secrets for CI). See `.env.example`
for the full list and what each value is used for. Production secrets are
visible only to repo admins; staging/dev secrets can be broader.
