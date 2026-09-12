"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import styles from "./public-header.module.css";

function Icon({ kind }: { kind: "search" | "bell" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      {kind === "search" ? <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></> : <><path d="M18 8a6 6 0 0 0-12 0c0 6-3 8-3 9h18c0-1-3-3-3-9M10 21h4" /></>}
    </svg>
  );
}

export function PublicHeader({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
      <Link href="/" className={styles.brand}>MOVIERA<small>CINEMA</small></Link>
      <button className={styles.toggle} type="button" aria-expanded={open} aria-controls="public-navigation" onClick={() => setOpen((value) => !value)}>{open ? "Close ✕" : "Menu ☰"}</button>
      <nav
        id="public-navigation"
        className={`${styles.nav} ${open ? styles.open : ""}`}
        aria-label="Main navigation"
        style={{ font: "14px/1.5 Arial, Helvetica, sans-serif" }}
      >
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Home</Link>
        <Link href="/cinemas" aria-current={pathname.startsWith("/cinemas") ? "page" : undefined}>Cinemas</Link>
        <Link href="/movies" aria-current={pathname.startsWith("/movies") ? "page" : undefined}>Movies</Link>
        <Link href="/showtimes" aria-current={pathname.startsWith("/showtimes") ? "page" : undefined}>Showtimes</Link>
      </nav>
      <div className={styles.account}>
        <Link href="/showtimes" aria-label="Search showtimes"><Icon kind="search" /></Link>
        <button type="button" disabled aria-label="Notifications coming soon" title="Coming soon"><Icon kind="bell" /></button>
        {email ? (
          <details><summary><span className={styles.avatar}>{email.charAt(0).toUpperCase()}</span><span className={styles.username}>{email.split("@")[0]}</span><svg className={styles.chevron} viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3.5 5.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary><div className={styles.dropdown}><Link href="/dashboard">Dashboard</Link><SignOutButton /></div></details>
        ) : <Link className={styles.signin} href="/login">Sign in</Link>}
      </div>
    </header>
  );
}
