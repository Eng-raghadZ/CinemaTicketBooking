import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCinemaStaffOrRedirect } from "@/lib/auth/guards";
import {
  canManageCinemaStaff,
  type CinemaStaffMembership,
} from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/auth/server";
import { InviteStaffForm } from "./invite-form";
import { RevokeStaffButton } from "./revoke-button";
import { StatusBadge } from "@/app/status-badge";
import ui from "@/app/ui.module.css";

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
  const { userId } = await requireCinemaStaffOrRedirect(cinemaId);

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cinema_staff")
    .select(
      "id, user_id, role, status, permissions, created_at, users:user_id(email, full_name)",
    )
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

  const canManage = canManageCinemaStaff(
    callerMembership as CinemaStaffMembership | null,
  );

  return (
    <main className={ui.container}>
      <Link href={`/dashboard/${cinemaId}`} className={ui.backLink}>
        ← Back to cinema
      </Link>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Staff</h1>
      </div>

      {staff.length === 0 ? (
        <p className={ui.emptyState}>No staff members yet.</p>
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
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
                  <td style={{ textTransform: "capitalize" }}>{row.role}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  {canManage && (
                    <td>
                      {row.role !== "owner" && row.status !== "revoked" && (
                        <RevokeStaffButton
                          cinemaId={cinemaId}
                          staffId={row.id}
                          isSelf={row.user_id === userId}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={ui.section} style={{ marginTop: 32 }}>
        {canManage ? (
          <InviteStaffForm cinemaId={cinemaId} />
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Only the cinema owner, or a manager granted the &quot;manage
            staff&quot; permission, can invite or revoke staff.
          </p>
        )}
      </div>
    </main>
  );
}
