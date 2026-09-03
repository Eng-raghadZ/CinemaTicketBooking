import Link from "next/link";
import { SignOutButton } from "@/app/(auth)/sign-out-button";
import chrome from "@/app/chrome.module.css";
import styles from "@/app/ui.module.css";

export default function OwnerStaffDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className={chrome.topbar}>
        <Link href="/dashboard" className={chrome.brand}>
          <span className={chrome.brandMark} aria-hidden="true" />
          Moviera
        </Link>
        <nav className={chrome.nav} aria-label="Dashboard">
          <Link href="/dashboard" className={chrome.navLink}>
            Your cinemas
          </Link>
          <Link href="/dashboard/register" className={chrome.navLink}>
            Register a cinema
          </Link>
          <SignOutButton className={styles.buttonGhost} />
        </nav>
      </header>
      {children}
    </>
  );
}
