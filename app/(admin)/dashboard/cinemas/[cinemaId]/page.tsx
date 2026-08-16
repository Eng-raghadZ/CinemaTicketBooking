import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { CinemaReviewActions } from "./review-actions";

interface CinemaDetail {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  country_code: string;
  currency_code: string;
  status: "pending_review" | "approved" | "suspended" | "rejected";
  rejection_reason: string | null;
  created_at: string;
  primary_owner_id: string;
}

export default async function AdminCinemaDetailPage({
  params,
}: {
  params: Promise<{ cinemaId: string }>;
}) {
  await requirePlatformAdmin();
  const { cinemaId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cinemas")
    .select(
      "id, name, description, location, country_code, currency_code, status, rejection_reason, created_at, primary_owner_id",
    )
    .eq("id", cinemaId)
    .maybeSingle();

  if (!data) notFound();
  const cinema = data as CinemaDetail;

  return (
    <main>
      <h1>{cinema.name}</h1>
      <dl>
        <dt>Status</dt>
        <dd>{cinema.status}</dd>
        <dt>Country / Currency</dt>
        <dd>
          {cinema.country_code} / {cinema.currency_code}
        </dd>
        <dt>Location</dt>
        <dd>{cinema.location ?? "—"}</dd>
        <dt>Description</dt>
        <dd>{cinema.description ?? "—"}</dd>
        <dt>Submitted</dt>
        <dd>{new Date(cinema.created_at).toLocaleString()}</dd>
        {cinema.rejection_reason && (
          <>
            <dt>Rejection reason</dt>
            <dd>{cinema.rejection_reason}</dd>
          </>
        )}
      </dl>

      <CinemaReviewActions cinemaId={cinema.id} status={cinema.status} />
    </main>
  );
}
