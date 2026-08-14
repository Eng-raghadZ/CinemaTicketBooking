/**
 * Server-side Supabase client bound to the caller's session cookie. Queries
 * made through this client go through Supabase's PostgREST layer using the
 * caller's own JWT, so every RLS policy in supabase/migrations/0005_*.sql
 * applies exactly as written — this is the ONLY correct way to get
 * per-request, tenant-isolated database access in Route Handlers/Server
 * Actions/Server Components. Never bypass this with the service-role key
 * for anything reachable from user input (see lib/db/client.ts).
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component that can't set cookies — safe
            // to ignore as long as middleware.ts is refreshing the session
            // (see middleware.ts), which is where the actual write happens.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // See note above.
          }
        },
      },
    },
  );
}

/**
 * Convenience helper: the current session's user id and platform role, or
 * null if unauthenticated. Route Handlers should call this first and return
 * 401/403 before doing anything else — RLS is the backstop, not the
 * first line of defense (see docs/security.md).
 */
export async function getCurrentUserContext() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return {
    userId: user.id,
    email: user.email,
    role: roleRow?.role ?? "customer",
  };
}
