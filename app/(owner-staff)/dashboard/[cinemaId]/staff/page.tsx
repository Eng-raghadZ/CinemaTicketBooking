import { notFound } from "next/navigation";
import { requireCinemaStaff } from "@/lib/auth/guards";
import { canManageCinemaStaff, type CinemaStaffMembership } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { InviteStaffForm } from "./invite-form";
import { RevokeStaffButton } from "./revoke-button";

interface StaffRow {
  id: string;
  user_id: string;
  role: string;
  status: string;
  permissions: Record<string, boolean> | null;
  created_at: string;
  users: { email: string; full_name: string | null } | null;
}

export default async function CinemaStaffPage({
  params,
}: {
  params: Promise<{ cinemaId: string }>;
}) {
  const { cinemaId } = await params;
  // Any active staff member (owner/manager/staff) may VIEW the roster —
  // requireCinemaStaff enforces "cannot touch another cinema" per the
  // architecture's authorization model. Whether they can INVITE/REVOKE is a
  // separate, finer-grained check below via canManageCinemaStaff.
  const { userId } = await requireCinemaStaff(cinemaId);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinema_staff")
    .select("id, user_id, role, status, permissions, created_at, users:user_id(email, full_name)")
    .eq("cinema_id", cinemaId)
    .order("created_at", { ascending: true });

  if (error) notFound();
  const staff = (data ?? []) as unknown as StaffRow[];

  const { data: callerMembership } = await supabase
    .from("cinema_staff")
    .select("role, status, permissions")
    .eq("cinema_id", cinemaId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const canManage = canManageCinemaStaff(callerMembership as CinemaStaffMembership | null);

  return (
    <main>
      <h1>Staff</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            {canManage && <th aria-label="actions" />}
          </tr>
        </thead>
        <tbody>
          {staff.map((row) => (
            <tr key={row.id}>
              <td>{row.users?.full_name ?? "—"}</td>
              <td>{row.users?.email ?? "—"}</td>
              <td>{row.role}</td>
              <td>{row.status}</td>
              {canManage && row.status !== "revoked" && (
                <td>
                  <RevokeStaffButton cinemaId={cinemaId} staffId={row.id} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {canManage && <InviteStaffForm cinemaId={cinemaId} />}
      {!canManage && (
        <p>Only the cinema owner, or a manager granted the &quot;manage staff&quot; permission, can invite or revoke staff.</p>
      )}
    </main>
  );
}
