/**
 * Test helper for exercising RLS "as" a given user/role, the same way
 * PostgREST (which powers Supabase's API layer) does in production: by
 * setting request.jwt.claims on the session and switching the active
 * Postgres role to `authenticated`, `anon`, or `service_role`.
 */
import postgres from "postgres";

const TEST_DATABASE_NAME = "cinema_platform_test";
// IMPORTANT: asUser() below deliberately connects as the ordinary, non-superuser
// `app_test` role rather than `postgres`. A superuser's session retains bypass
// privileges even after `SET ROLE` to a non-superuser role in some evaluation
// paths, which would make RLS tests pass vacuously. `app_test` has been granted
// membership in anon/authenticated/service_role (see db:test:setup) with none
function requireIsolatedTestDatabaseUrl(
  envName: "TEST_DATABASE_URL" | "APP_DATABASE_URL",
): string {
  const value = process.env[envName];

  if (!value) {
    throw new Error(
      `${envName} is required. Integration tests must use the isolated ` +
        `${TEST_DATABASE_NAME} database.`,
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} is not a valid PostgreSQL URL.`);
  }

  const databaseName = parsed.pathname.replace(/^\/+/, "");

  if (databaseName !== TEST_DATABASE_NAME) {
    throw new Error(
      `Refusing to run destructive integration tests against database ` +
        `"${databaseName || "(missing)"}". Expected "${TEST_DATABASE_NAME}".`,
    );
  }

  return value;
}

const TEST_DATABASE_URL =
  requireIsolatedTestDatabaseUrl("TEST_DATABASE_URL");

const APP_DATABASE_URL =
  requireIsolatedTestDatabaseUrl("APP_DATABASE_URL");

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
