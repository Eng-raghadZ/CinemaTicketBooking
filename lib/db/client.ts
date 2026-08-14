/**
 * Server-side Drizzle client for the TRUSTED SERVICE-ROLE PATH ONLY
 * (bypasses RLS entirely). Used by: the seat-hold sweeper job, the Stripe
 * webhook handler, and admin bootstrap/seed scripts — code that has already
 * done its own authorization check in application logic before touching the
 * database, because RLS will not do it here.
 *
 * For ordinary, per-request, user-scoped queries in Route Handlers/Server
 * Actions, do NOT use this client. Use the Supabase JS client bound to the
 * caller's session instead (lib/auth/server.ts's `createServerSupabaseClient`
 * / `createBrowserSupabaseClient`), which talks to Supabase's PostgREST layer
 * over the user's own JWT and gets RLS enforcement exactly as this
 * architecture requires. Hand-constructing a direct Postgres connection with
 * spoofed JWT claims per request would be both non-standard and a much
 * larger trust surface than necessary — PostgREST (via supabase-js) is the
 * correct, documented mechanism for RLS-scoped queries in Supabase.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let _serviceClient: ReturnType<typeof postgres> | null = null;

/**
 * Service-role Drizzle client (bypasses RLS). `DATABASE_URL_SERVICE_ROLE`
 * should point at Supabase's pooled connection string (Supavisor, transaction
 * mode) — required in serverless environments to avoid exhausting Postgres
 * connections; `prepare: false` is required for that pooling mode.
 */
export function serviceDb() {
  if (!_serviceClient) {
    _serviceClient = postgres(requireEnv("DATABASE_URL_SERVICE_ROLE"), {
      max: 5,
      prepare: false,
    });
  }
  return drizzle(_serviceClient, { schema });
}
