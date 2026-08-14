import { NextResponse } from "next/server";
import { releaseExpiredSeatHolds } from "@/supabase/functions/release-expired-seat-holds";

/**
 * Called by Vercel Cron (see vercel.json) on a schedule. Protected by
 * CRON_SECRET so it can't be triggered by an arbitrary public request.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await releaseExpiredSeatHolds();
  return NextResponse.json(result);
}
