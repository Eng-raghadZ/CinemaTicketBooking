import Link from "next/link";
import ui from "@/app/ui.module.css";

/**
 * Friendly landing page for an expected authorization failure — e.g. a
 * cinema_staff membership that was revoked while the user still has the
 * dashboard URL bookmarked/open. Reached via `redirect()` from
 * lib/auth/guards.ts's `requireCinemaStaffOrRedirect` /
 * `requirePlatformAdminOrRedirect` when the underlying guard throws
 * `ForbiddenError` — the guard itself is unchanged; this page only
 * replaces what the user sees instead of a raw error overlay/stack trace.
 */
export default function AccessDeniedPage() {
  return (
    <main className={ui.container} style={{ maxWidth: 480, paddingTop: 96 }}>
      <p style={{ color: "var(--color-accent-bright)", fontSize: 12, letterSpacing: 3, fontWeight: 500, margin: "0 0 12px" }}>
        ACCESS DENIED
      </p>
      <h1 className={ui.pageTitle}>You don&apos;t have access to that cinema</h1>
      <p className={ui.pageSubtitle}>
        Your access may have changed. If you believe this is a mistake, check
        with the cinema owner or an administrator.
      </p>
      <p style={{ marginTop: 24 }}>
        <Link href="/dashboard" className={ui.buttonPrimary}>
          Back to your dashboard
        </Link>
      </p>
    </main>
  );
}
