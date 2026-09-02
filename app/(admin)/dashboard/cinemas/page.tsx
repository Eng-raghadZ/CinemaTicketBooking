import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";

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
    <main>
      <h1>Cinema review queue</h1>
      <nav aria-label="Admin sections">
        <Link href="/dashboard/movies">Movie catalog</Link>
      </nav>
      <nav aria-label="Filter by status">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/dashboard/cinemas?status=${tab}`}
            aria-current={tab === status ? "page" : undefined}
          >
            {tab.replace("_", " ")}
          </Link>
        ))}
      </nav>

      {cinemas.length === 0 ? (
        <p>No cinemas with status &quot;{status.replace("_", " ")}&quot;.</p>
      ) : (
        <ul>
          {cinemas.map((cinema) => (
            <li key={cinema.id}>
              <Link href={`/dashboard/cinemas/${cinema.id}`}>
                {cinema.name}
              </Link>{" "}
              — {cinema.country_code} / {cinema.currency_code} —{" "}
              {new Date(cinema.created_at).toLocaleDateString()}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
