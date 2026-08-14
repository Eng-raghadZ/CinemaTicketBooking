import { NextResponse } from "next/server";

/**
 * Minimal health check for deployment smoke tests / uptime monitoring.
 * Deliberately does NOT touch the database with the service-role key on
 * every request (that would make this endpoint a cheap DB-load vector) —
 * it just confirms the app is serving traffic. A separate, authenticated
 * admin-only endpoint can add a real DB ping in Phase 8 if needed.
 */
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
