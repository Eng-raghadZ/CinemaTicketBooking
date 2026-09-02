import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/server";

export async function SiteHeader() {
  const user = await getCurrentUserContext();

  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="Moviera home">
        <svg className="site-brand-mark" viewBox="0 0 48 58" aria-hidden="true">
          <path d="M8 48V13L21 7v41M17 48V18l13-6v36M26 48V22l13-6v32M4 48h40M4 54h40" />
        </svg>
        <span className="site-brand-copy">Moviera<small>CINEMA PLATFORM</small></span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/">Home</Link>
        {user ? (
          <Link href="/dashboard">Dashboard</Link>
        ) : (
          <Link className="nav-cta" href="/login">Sign In</Link>
        )}
      </nav>
    </header>
  );
}
