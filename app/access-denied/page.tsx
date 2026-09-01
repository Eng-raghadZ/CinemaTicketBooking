import Link from "next/link";

/**
 * Friendly landing page for an expected authorization failure — e.g. a
 * cinema_staff membership that was revoked while the user still has the
 * dashboard URL bookmarked/open. Reached via `redirect()` from
 * lib/auth/guards.ts's `requireCinemaStaffOrRedirect` /
 * `requirePlatformAdminOrRedirect` when the underlying guard throws
 * `ForbiddenError` — the guard itself is unchanged; this page only
 * replaces what the user sees instead of a raw error overlay/stack trace.
 *
 * Deliberately outside the `/dashboard` prefix so middleware.ts's
 * authenticated-only redirect doesn't apply here — a ForbiddenError only
 * ever occurs for an already-authenticated user, so this page never needs
 * to itself require a session.
 */
export default function AccessDeniedPage() {
  return (
    <main>
      <h1>Access denied</h1>
      <p>
        You don&apos;t have access to that cinema, or your access has
        changed. If you believe this is a mistake, check with the cinema
        owner or an administrator.
      </p>
      <p>
        <Link href="/dashboard">Back to your dashboard</Link>
      </p>
    </main>
  );
}
