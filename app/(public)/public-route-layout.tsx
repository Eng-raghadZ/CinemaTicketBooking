"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import styles from "./public-layout.module.css";

export function PublicRouteLayout({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string | null;
}) {
  const pathname = usePathname();

  if (pathname === "/cinemas") {
    return (
      <div className={styles.cinemaShell}>
        <PublicHeader email={email} />
        {children}
        <PublicFooter />
      </div>
    );
  }

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
        {email ? (
          <>
            <Link href="/dashboard">Dashboard</Link>
            {" | "}
            <span>{email}</span>
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
