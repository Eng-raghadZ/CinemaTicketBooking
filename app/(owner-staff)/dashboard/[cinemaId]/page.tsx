import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import { cinemaDashboardNavLabels, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { CinemaDashboardView } from "./cinema-dashboard-view";

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

  return <CinemaDashboardView cinema={cinema} navLabels={navLabels} />;
}
