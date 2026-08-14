/**
 * Releases expired seat holds. Runs on a schedule (e.g. Vercel Cron every
 * minute, or Supabase's pg_cron calling this via an Edge Function) — see
 * docs/environments.md for the concrete scheduling setup per environment.
 *
 * Uses the service-role client deliberately: this is exactly the trusted,
 * server-only code path the architecture reserves RLS-bypass for. It never
 * takes input from a request; it only acts on the `expires_at` column.
 */
import { eq, and, lt } from "drizzle-orm";
import { serviceDb } from "@/lib/db/client";
import { seatHolds } from "@/lib/db/schema";

export async function releaseExpiredSeatHolds(): Promise<{ released: number }> {
  const db = serviceDb();

  const result = await db
    .update(seatHolds)
    .set({ status: "released" })
    .where(and(eq(seatHolds.status, "held"), lt(seatHolds.expiresAt, new Date())))
    .returning({ id: seatHolds.id });

  return { released: result.length };
}
