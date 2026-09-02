import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { AcceptInviteButton } from "./accept-invite-button";

interface MembershipRow {
  id: string;
  role: string;
  status: string;
  cinemas: {
    id: string;
    name: string;
    status: string;
    location: string | null;
    currency_code: string;
  } | null;
}

function displayLabel(value: string) {
  return value.replaceAll("_", " ");
}

export default async function DashboardHomePage() {
  const { userId } = await requireAuthenticatedUser();
  const supabase = await createServerSupabaseClient();

  const { data } = await supabase
    .from("cinema_staff")
    .select("id, role, status, cinemas:cinema_id(id, name, status, location, currency_code)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const memberships = (data ?? []) as unknown as MembershipRow[];
  const active = memberships.filter((m) => m.status === "active");
  const invited = memberships.filter((m) => m.status === "invited");

  return (
    <main className="owner-dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <p className="eyebrow">OWNER WORKSPACE</p>
          <h1>Your cinemas</h1>
          <p>Manage your cinema locations and operational access.</p>
        </div>
        <Link className="button-primary dashboard-register" href="/dashboard/register">
          Register a cinema
        </Link>
      </section>

      <div className="dashboard-content">
        <section className="dashboard-section dashboard-invitations">
          <h2>Pending invitations</h2>
          {invited.length > 0 ? (
          <ul>
            {invited.map((m) => (
              <li key={m.id}>
                <span>
                  <strong>{m.cinemas?.name ?? "Unknown cinema"}</strong>
                  Invited as {displayLabel(m.role)}
                </span>
                <AcceptInviteButton staffId={m.id} />
              </li>
            ))}
          </ul>
          ) : (
            <p className="dashboard-empty">No pending invitations.</p>
          )}
        </section>

        <section className="dashboard-section dashboard-cinemas">
          <h2>Your cinemas</h2>
          {active.length === 0 ? (
            <div className="dashboard-empty">
              <p>You don&apos;t manage any cinemas yet.</p>
              <Link href="/dashboard/register">Register one</Link>
            </div>
          ) : (
            <ul className="cinema-list">
              {active.map((m) => {
                const cinema = m.cinemas;
                if (!cinema) return null;

                return (
                  <li className="cinema-row" key={m.id}>
                    <strong>{cinema.name}</strong>
                    <span>{cinema.location ?? "Location not provided"} · {cinema.currency_code}</span>
                    <span>{displayLabel(m.role)}</span>
                    <span className={`cinema-status cinema-status-${cinema.status}`}>
                      {displayLabel(cinema.status)}
                    </span>
                    <Link className="cinema-action" href={`/dashboard/${cinema.id}`}>
                      {cinema.status === "rejected" ? "View details" : "Manage"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
