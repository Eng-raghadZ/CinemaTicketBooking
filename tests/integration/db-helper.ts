/**
 * Test helper for exercising RLS "as" a given user/role, the same way
 * PostgREST (which powers Supabase's API layer) does in production: by
 * setting request.jwt.claims on the session and switching the active
 * Postgres role to `authenticated`, `anon`, or `service_role`.
 */
import postgres from "postgres";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres_dev_password@localhost:5432/cinema_platform_dev";

// IMPORTANT: asUser() below deliberately connects as the ordinary, non-superuser
// `app` role rather than `postgres`. A superuser's session retains bypass
// privileges even after `SET ROLE` to a non-superuser role in some evaluation
// paths, which would make RLS tests pass vacuously. `app` has been granted
// membership in anon/authenticated/service_role (see db:test:setup) with none
// of BYPASSRLS/superuser, so SET ROLE here genuinely activates RLS — the same
// as a real PostgREST/Supabase request would experience.
const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ??
  "postgres://app:app_dev_password@localhost:5432/cinema_platform_dev";

export function adminSql() {
  // Full-privilege connection for fixture setup (bypasses RLS as superuser).
  return postgres(TEST_DATABASE_URL, { max: 1 });
}

export type SimulatedRole = "anon" | "authenticated" | "service_role";

/**
 * Runs `fn` inside a transaction with the Postgres session acting as the
 * given role and (optionally) a specific user id embedded in JWT claims —
 * the exact mechanism Supabase/PostgREST uses to enforce RLS per request.
 * The transaction is committed so side effects (inserts/updates) persist,
 * matching real request behavior; tests that need isolation truncate
 * fixture tables in beforeEach instead of relying on rollback.
 */
export async function asUser<T>(
  opts: { userId?: string; role?: SimulatedRole },
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  const sql = postgres(APP_DATABASE_URL, { max: 1 });
  const pgRole = opts.role ?? "authenticated";
  let result!: T;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${pgRole}`);
      if (opts.userId) {
        const claims = JSON.stringify({ sub: opts.userId, role: pgRole });
        await tx.unsafe(`select set_config('request.jwt.claims', $1, true)`, [claims]);
      }
      result = await fn(tx);
    });
    return result;
  } finally {
    await sql.end();
  }
}
