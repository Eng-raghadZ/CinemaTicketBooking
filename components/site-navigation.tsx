"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/app/(auth)/sign-out-button";

type SiteNavigationProps = {
  isAuthenticated: boolean;
};

export function SiteNavigation({ isAuthenticated }: SiteNavigationProps) {
  const pathname = usePathname();
  const onDashboard = pathname.startsWith("/dashboard");

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      <Link className={pathname === "/" ? "active" : undefined} href="/">
        Home
      </Link>
      {isAuthenticated ? (
        <>
          <Link className={onDashboard ? "active" : undefined} href="/dashboard">
            Dashboard
          </Link>
          <SignOutButton className="nav-auth-action" />
        </>
      ) : (
        <Link className="nav-auth-action" href="/login">
          Sign In
        </Link>
      )}
    </nav>
  );
}
