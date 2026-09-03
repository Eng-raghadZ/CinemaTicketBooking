import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { AcceptInviteButton } from "./accept-invite-button";
import { StatusBadge } from "@/app/status-badge";
import ui from "@/app/ui.module.css";

interface MembershipRow {
  id: string;
  role: string;
  status: string;
  cinemas: { id: string; name: string; status: string } | null;
}

export default async function DashboardHomePage() {
  const { userId } = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("cinema_staff")
    .select("id, role, status, cinemas:cinema_id(id, name, status)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const memberships = (data ?? []) as unknown as MembershipRow[];
  const active = memberships.filter((m) => m.status === "active");
  const invited = memberships.filter((m) => m.status === "invited");

  return (
    <main className={ui.container}>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Your dashboard</h1>
        <p className={ui.pageSubtitle}>Cinemas you own or work at, and any pending invitations.</p>
      </div>

      {invited.length > 0 && (
        <section className={ui.section}>
          <div className={ui.sectionHeader}>
            <h2 className={ui.sectionTitle}>Pending invites</h2>
          </div>
          <div className={ui.grid}>
            {invited.map((m) => (
              <div key={m.id} className={ui.card}>
                <p style={{ margin: "0 0 4px", fontSize: 14 }}>{m.cinemas?.name ?? "Unknown cinema"}</p>
                <p style={{ margin: "0 0 12px", color: "var(--color-text-muted)", fontSize: 13 }}>
                  Invited as {m.role}
                </p>
                <AcceptInviteButton staffId={m.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={ui.section}>
        <div className={ui.sectionHeader}>
          <h2 className={ui.sectionTitle}>Your cinemas</h2>
          <Link href="/dashboard/register" className={ui.buttonGhost}>
            Register a new cinema
          </Link>
        </div>

        {active.length === 0 ? (
          <p className={ui.emptyState}>
            You don&apos;t manage any cinemas yet.{" "}
            <Link href="/dashboard/register" className={ui.link}>
              Register one
            </Link>
            .
          </p>
        ) : (
          <div className={ui.grid}>
            {active.map((m) => (
              <Link
                key={m.id}
                href={`/dashboard/${m.cinemas?.id}`}
                className={`${ui.card} ${ui.cardLink}`}
              >
                <p style={{ margin: "0 0 8px", fontSize: 15 }}>{m.cinemas?.name}</p>
                <p style={{ margin: "0 0 10px", color: "var(--color-text-muted)", fontSize: 13, textTransform: "capitalize" }}>
                  {m.role}
                </p>
                {m.cinemas?.status && <StatusBadge status={m.cinemas.status} />}
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
