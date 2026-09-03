import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import ui from "@/app/ui.module.css";

const STATUS_TABS = [
  "pending_review",
  "approved",
  "suspended",
  "rejected",
] as const;
type StatusTab = (typeof STATUS_TABS)[number];

interface CinemaRow {
  id: string;
  name: string;
  country_code: string;
  currency_code: string;
  status: StatusTab;
  created_at: string;
}

function isStatusTab(value: string | undefined): value is StatusTab {
  return !!value && (STATUS_TABS as readonly string[]).includes(value);
}

export default async function AdminCinemasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePlatformAdmin();
  const { status: rawStatus } = await searchParams;
  const status: StatusTab = isStatusTab(rawStatus)
    ? rawStatus
    : "pending_review";

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cinemas")
    .select("id, name, country_code, currency_code, status, created_at")
    .eq("status", status)
    .order("created_at", { ascending: true });

  const cinemas = (data ?? []) as CinemaRow[];

  return (
    <main className={ui.container}>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Cinema review queue</h1>
      </div>

      <nav className={ui.tabs} aria-label="Filter by status">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/dashboard/cinemas?status=${tab}`}
            aria-current={tab === status ? "page" : undefined}
            className={tab === status ? ui.tabActive : ui.tab}
            style={{ textTransform: "capitalize" }}
          >
            {tab.replace("_", " ")}
          </Link>
        ))}
      </nav>

      {cinemas.length === 0 ? (
        <p className={ui.emptyState}>No cinemas with status &quot;{status.replace("_", " ")}&quot;.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Cinema</th>
                <th>Country / Currency</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {cinemas.map((cinema) => (
                <tr key={cinema.id}>
                  <td>
                    <Link href={`/dashboard/cinemas/${cinema.id}`} className={ui.link}>
                      {cinema.name}
                    </Link>
                  </td>
                  <td>
                    {cinema.country_code} / {cinema.currency_code}
                  </td>
                  <td>{new Date(cinema.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
