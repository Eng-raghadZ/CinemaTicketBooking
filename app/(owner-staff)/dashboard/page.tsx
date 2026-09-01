import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { DashboardHomeView } from "./dashboard-home-view";

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

  return <DashboardHomeView active={active} invited={invited} />;
}
