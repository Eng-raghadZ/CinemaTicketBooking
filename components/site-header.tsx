"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const onAuthPage = pathname === "/login" || pathname === "/signup";
  const onDashboard = pathname.startsWith("/dashboard");
  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="Moviera home">
        <span className="site-brand-mark" aria-hidden="true">M</span>
        <span>Moviera<small>CINEMA PLATFORM</small></span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link className={pathname === "/" ? "active" : ""} href="/">Home</Link>
        <Link className={pathname.startsWith("/dashboard") ? "active" : ""} href="/dashboard">Dashboard</Link>
        <Link href="/dashboard/register">Register cinema</Link>
        {!onAuthPage && !onDashboard && <Link className="nav-cta" href="/login">Sign in</Link>}
      </nav>
    </header>
  );
}
