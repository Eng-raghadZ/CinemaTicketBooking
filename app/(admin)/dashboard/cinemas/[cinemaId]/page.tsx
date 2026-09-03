import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdminOrRedirect } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { CinemaReviewActions } from "./review-actions";
import { StatusBadge } from "@/app/status-badge";
import ui from "@/app/ui.module.css";

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
  await requirePlatformAdminOrRedirect();
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

  const details: [string, React.ReactNode][] = [
    ["Country / Currency", `${cinema.country_code} / ${cinema.currency_code}`],
    ["Location", cinema.location ?? "—"],
    ["Description", cinema.description ?? "—"],
    ["Submitted", new Date(cinema.created_at).toLocaleString()],
  ];
  if (cinema.rejection_reason) {
    details.push(["Rejection reason", cinema.rejection_reason]);
  }

  return (
    <main className={ui.container} style={{ maxWidth: 640 }}>
      <Link href="/dashboard/cinemas" className={ui.backLink}>
        ← Back to review queue
      </Link>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>{cinema.name}</h1>
        <p style={{ margin: "10px 0 0" }}>
          <StatusBadge status={cinema.status} />
        </p>
      </div>

      <dl className={ui.card} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", fontSize: 13 }}>
        {details.map(([label, value]) => (
          <div key={label} style={{ display: "contents" }}>
            <dt style={{ color: "var(--color-text-muted)" }}>{label}</dt>
            <dd style={{ margin: 0 }}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className={ui.section} style={{ marginTop: 28 }}>
        <CinemaReviewActions cinemaId={cinema.id} status={cinema.status} />
      </div>
    </main>
  );
}
