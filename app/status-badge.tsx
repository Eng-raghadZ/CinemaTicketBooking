import ui from "@/app/ui.module.css";

const STATUS_BADGE_CLASS: Record<string, string | undefined> = {
  approved: ui.badgeApproved,
  active: ui.badgeActive,
  pending_review: ui.badgePending,
  invited: ui.badgeInvited,
  suspended: ui.badgeSuspended,
  rejected: ui.badgeRejected,
  revoked: ui.badgeRevoked,
};

/** Renders a cinema/staff/membership status as a colored pill, using the existing status strings verbatim — no new states invented. */
export function StatusBadge({ status }: { status: string }) {
  const className = STATUS_BADGE_CLASS[status] ?? ui.badgeNeutral;
  return <span className={className}>{status.replace(/_/g, " ")}</span>;
}
