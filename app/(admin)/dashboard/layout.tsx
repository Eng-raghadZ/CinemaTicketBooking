import Link from "next/link";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import chrome from "@/app/chrome.module.css";
import styles from "@/app/ui.module.css";

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className={chrome.topbar}>
        <Link href="/dashboard/cinemas" className={chrome.brand}>
          <span className={chrome.brandMark} aria-hidden="true" />
          Moviera <span style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>Admin</span>
        </Link>
        <nav className={chrome.nav} aria-label="Admin">
          <Link href="/dashboard/cinemas" className={chrome.navLink}>
            Cinema review
          </Link>
          <Link href="/dashboard/movies" className={chrome.navLink}>
            Movie catalog
          </Link>
          <SignOutButton className={styles.buttonGhost} />
        </nav>
      </header>
      {children}
    </>
  );
}
