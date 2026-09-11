"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./auth.module.css";

export function AuthHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Moviera home">
        MOVIERA<small>CINEMA</small>
      </Link>
      <button
        className={styles.toggle}
        type="button"
        aria-expanded={open}
        aria-controls="auth-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close ✕" : "Menu ☰"}
      </button>
      <nav
        id="auth-navigation"
        className={`${styles.nav} ${open ? styles.open : ""}`}
        aria-label="Main navigation"
      >
        <Link href="/">Home</Link>
        <Link href="/cinemas">Cinemas</Link>
        <Link href="/movies">Movies</Link>
        <Link href="/showtimes">Showtimes</Link>
      </nav>
    </header>
  );
}
