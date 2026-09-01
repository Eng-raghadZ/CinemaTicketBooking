import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Moviera
        </Link>
        <div className={styles.navLinks}>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/dashboard/register">Register a cinema</Link>
          <Link href="/login" className={styles.signInButton}>Sign in</Link>
        </div>
      </nav>
      <section className={styles.hero}>
        <div className={styles.heroBackdrop} aria-hidden="true" />
        <p className={styles.eyebrow}>THE CINEMA, MADE SEAMLESS</p>
        <h1 className={styles.headline}>Every great story starts with a seat.</h1>
        <p className={styles.subcopy}>
          A platform for cinema owners and staff to manage their catalog,
          showtimes, and teams — with public browsing and booking coming next.
        </p>
        <div className={styles.ctaRow}>
          <Link href="/login" className={styles.ctaPrimary}>Sign in to Moviera</Link>
          <Link href="/signup" className={styles.ctaSecondary}>Create an account</Link>
        </div>
      </section>
      <section className={styles.status}>
        <h2 className={styles.statusHeading}>WHERE THINGS STAND</h2>
        <ul className={styles.statusList}>
          <li><strong>Foundations —</strong> implemented (auth, database, RLS, CI/CD).</li>
          <li><strong>Cinema onboarding &amp; staff —</strong> implemented.</li>
          <li><strong>Catalog management —</strong> implemented (movies, screens, showtimes).</li>
          <li><strong>Public browsing &amp; booking —</strong> future work.</li>
        </ul>
      </section>
    </div>
  );
}
