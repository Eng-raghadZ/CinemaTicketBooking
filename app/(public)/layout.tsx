import Link from "next/link";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import { getCurrentUserContext } from "@/lib/auth/server";

/**
 * Shared layout for the public customer-browsing route group (Phase 3):
 * /cinemas, /movies, /showtimes, and their [id] detail pages, plus
 * /booking-unavailable. Deliberately minimal — no visual redesign, per the
 * Phase 3 scope boundary. None of these routes fall under
 * middleware.ts's PROTECTED_PREFIXES ("/account", "/bookings",
 * "/dashboard"), so they're reachable without a session, exactly as
 * required for public browsing.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? await getCurrentUserContext()
      : null;

  return (
    <div>
      <nav aria-label="Browse">
        <Link href="/">Home</Link>
        {" | "}
        <Link href="/cinemas">Cinemas</Link>
        {" | "}
        <Link href="/movies">Movies</Link>
        {" | "}
        <Link href="/showtimes">Showtimes</Link>
        {" | "}
        {user ? (
          <>
            <Link href="/dashboard">Dashboard</Link>
            {" | "}
            <span>{user.email ?? "Account"}</span>
            {" | "}
            <SignOutButton />
          </>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </nav>
      {children}
    </div>
  );
}
