/**
 * Browser-side Supabase client. Uses the public anon key only — RLS still
 * applies to every query made through this client exactly as it does
 * server-side. Never import the service-role key into any file that could
 * end up in a client bundle.
 */
import { createBrowserClient } from "@supabase/ssr";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
