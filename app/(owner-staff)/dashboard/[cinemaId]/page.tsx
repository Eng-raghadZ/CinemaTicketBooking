import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import { cinemaDashboardNavLabels, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { StatusBadge } from "@/app/status-badge";
import ui from "@/app/ui.module.css";

type CinemaDashboardPageProps = {
  params: Promise<{ cinemaId: string }>;
};

export default async function CinemaDashboardPage({
  params,
}: CinemaDashboardPageProps) {
  const { cinemaId } = await params;

  const { userId } = await requireCinemaStaffOrRedirect(cinemaId);

  const supabase = await createServerSupabaseClient();
  const [{ data: cinema, error }, { data: membership }] = await Promise.all([
    supabase
      .from("cinemas")
      .select("id, name, status, rejection_reason")
      .eq("id", cinemaId)
      .single(),
    // Fetch the caller's own permissions (not just role) so the nav below
    // can tell a manager with e.g. only 'manage_screens' apart from one
    // with full catalog access — matches the same membership shape every
    // other cinema-side page (staff/movies/screens/showtimes) already
    // queries for its own management-UI gating.
    supabase
      .from("cinema_staff")
      .select("role, status, permissions")
      .eq("cinema_id", cinemaId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (error || !cinema) {
    notFound();
  }

  // Labels only — every link below still points to a page whose own guard
  // (requireCinemaStaff / requireCinemaCatalogPermission) and RLS remain
  // the actual security boundary. This purely keeps the wording honest for
  // a read-only staff member so "Manage X" is never shown for a page they
  // can only view.
  const navLabels = cinemaDashboardNavLabels(membership as CinemaStaffMembership | null);

  const navItems = [
    { href: `/dashboard/${cinema.id}/staff`, label: navLabels.staff },
    { href: `/dashboard/${cinema.id}/movies`, label: navLabels.movies },
    { href: `/dashboard/${cinema.id}/screens`, label: navLabels.screens },
    { href: `/dashboard/${cinema.id}/showtimes`, label: navLabels.showtimes },
  ];

  return (
    <main className={ui.container}>
      <Link href="/dashboard" className={ui.backLink}>
        ← Back to your cinemas
      </Link>

      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>{cinema.name}</h1>
        <p style={{ margin: "10px 0 0" }}>
          <StatusBadge status={cinema.status} />
        </p>
      </div>

      {cinema.status === "pending_review" && (
        <p className={ui.emptyState}>Your cinema is waiting for platform administrator review.</p>
      )}

      {cinema.status === "rejected" && cinema.rejection_reason && (
        <p role="alert" className={ui.alertError}>
          Rejection reason: {cinema.rejection_reason}
        </p>
      )}

      {cinema.status === "suspended" && (
        <p role="alert" className={ui.alertError}>
          This cinema is currently suspended.
        </p>
      )}

      <nav aria-label="Cinema management" className={ui.grid} style={{ marginTop: 28 }}>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={`${ui.card} ${ui.cardLink}`}>
            <span style={{ textTransform: "capitalize", fontSize: 14 }}>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
