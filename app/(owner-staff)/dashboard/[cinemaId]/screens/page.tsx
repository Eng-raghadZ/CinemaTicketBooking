import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import { hasCinemaPermission, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { ScreenForm } from "./screen-form";
import ui from "@/app/ui.module.css";

interface ScreenRow {
  id: string;
  name: string;
  layout_config: { rows?: number; seatsPerRow?: number; seatType?: string } | null;
  created_at: string;
}

export default async function CinemaScreensPage({
  params,
}: {
  params: Promise<{ cinemaId: string }>;
}) {
  const { cinemaId } = await params;
  const { userId } = await requireCinemaStaffOrRedirect(cinemaId);

  const supabase = await createServerSupabaseClient();
  const [{ data, error }, { data: membership }] = await Promise.all([
    supabase
      .from("screens")
      .select("id, name, layout_config, created_at")
      .eq("cinema_id", cinemaId)
      .order("created_at", { ascending: true }),
    supabase
      .from("cinema_staff")
      .select("role, status, permissions")
      .eq("cinema_id", cinemaId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (error) notFound();
  const screens = (data ?? []) as ScreenRow[];
  // Owner, or manager explicitly granted 'manage_screens' — matches
  // supabase/migrations/0013_catalog_permission_enforcement.sql exactly, so
  // this button never shows for someone whose write would be rejected by RLS.
  const canManage = hasCinemaPermission(membership as CinemaStaffMembership | null, "manage_screens");

  return (
    <main className={ui.container}>
      <Link href={`/dashboard/${cinemaId}`} className={ui.backLink}>
        ← Back to cinema
      </Link>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Screens</h1>
      </div>

      <section className={ui.section}>
        <div className={ui.sectionHeader}>
          <h2 className={ui.sectionTitle}>Existing screens ({screens.length})</h2>
        </div>
        {screens.length === 0 ? (
          <p className={ui.emptyState}>No screens yet.</p>
        ) : (
          <div className={ui.grid}>
            {screens.map((screen) => {
              const rows = screen.layout_config?.rows;
              const seatsPerRow = screen.layout_config?.seatsPerRow;
              const total = rows && seatsPerRow ? rows * seatsPerRow : undefined;
              return (
                <div key={screen.id} className={ui.card}>
                  <p style={{ margin: "0 0 6px", fontSize: 14 }}>{screen.name}</p>
                  {rows && seatsPerRow ? (
                    <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 12 }}>
                      {rows} rows × {seatsPerRow} seats ({total} total, {screen.layout_config?.seatType})
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={ui.section}>
        {canManage ? (
          <>
            <div className={ui.sectionHeader}>
              <h2 className={ui.sectionTitle}>Create a new screen</h2>
            </div>
            <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "0 0 16px" }}>
              The seat grid is generated automatically from the rows/seats you choose.
            </p>
            <ScreenForm cinemaId={cinemaId} />
          </>
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Only the cinema owner, or a manager granted the &quot;manage screens&quot; permission,
            can create screens.
          </p>
        )}
      </section>
    </main>
  );
}
