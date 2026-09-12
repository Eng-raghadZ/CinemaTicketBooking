import Link from "next/link";
import styles from "./public-footer.module.css";

export function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <Link href="/" className={styles.brand}>
        MOVIERA<small>CINEMA</small>
      </Link>
      <nav aria-label="Footer navigation">
        <Link href="/">Home</Link>
        <Link href="/cinemas">Cinemas</Link>
        <Link href="/movies">Movies</Link>
        <Link href="/showtimes">Showtimes</Link>
        <span title="Coming soon">Help Center</span>
        <span title="Coming soon">Terms of Use</span>
        <span title="Coming soon">Privacy Policy</span>
      </nav>
      <span className={styles.contact}>Social &amp; contact details · Coming soon</span>
    </footer>
  );
}
