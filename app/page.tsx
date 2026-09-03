import Link from "next/link";
import chrome from "./chrome.module.css";
import styles from "./page.module.css";
import ui from "./ui.module.css";

export default function HomePage() {
  return (
    <div>
      <header className={chrome.topbar}>
        <Link href="/" className={chrome.brand}>
          <span className={chrome.brandMark} aria-hidden="true" />
          Moviera
        </Link>
        <nav className={chrome.nav} aria-label="Main">
          <Link href="/dashboard" className={chrome.navLink}>
            Dashboard
          </Link>
          <Link href="/login" className={ui.buttonGhost}>
            Sign in
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <p className={styles.eyebrow}>THE CINEMA, MADE SEAMLESS</p>
        <h1 className={styles.headline}>Every great story starts with a seat.</h1>
        <p className={styles.subcopy}>
          A platform for cinema owners and staff to manage their catalog,
          showtimes, and teams — with public browsing and booking coming next.
        </p>
        <div className={styles.ctaRow}>
          <Link href="/signup" className={ui.buttonPrimary}>
            Create an account
          </Link>
          <Link href="/login" className={ui.buttonGhost}>
            Sign in
          </Link>
        </div>
      </section>

      <section className={ui.container}>
        <h2 className={ui.sectionTitle}>Where things stand</h2>
        <ul className={styles.statusList}>
          <li>
            <strong>Foundations —</strong> implemented (auth, database, RLS,
            CI/CD).
          </li>
          <li>
            <strong>Cinema onboarding &amp; staff —</strong> implemented.
          </li>
          <li>
            <strong>Catalog management —</strong> implemented (movies,
            screens, showtimes).
          </li>
          <li>
            <strong>Public browsing &amp; booking —</strong> future work.
          </li>
        </ul>
      </section>
    </div>
  );
}
