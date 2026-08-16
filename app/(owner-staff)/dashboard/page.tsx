import Link from "next/link";
import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { AcceptInviteButton } from "./accept-invite-button";

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
    <main>
      <h1>Your dashboard</h1>

      {invited.length > 0 && (
        <section>
          <h2>Pending invites</h2>
          <ul>
            {invited.map((m) => (
              <li key={m.id}>
                {m.cinemas?.name ?? "Unknown cinema"} — invited as {m.role}
                <AcceptInviteButton staffId={m.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Your cinemas</h2>
        {active.length === 0 ? (
          <p>
            You don&apos;t manage any cinemas yet.{" "}
            <Link href="/dashboard/register">Register one</Link>.
          </p>
        ) : (
          <ul>
            {active.map((m) => (
              <li key={m.id}>
                <Link href={`/dashboard/${m.cinemas?.id}`}>{m.cinemas?.name}</Link> — {m.role} —{" "}
                {m.cinemas?.status}
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/dashboard/register">Register a new cinema</Link>
        </p>
      </section>
    </main>
  );
}
