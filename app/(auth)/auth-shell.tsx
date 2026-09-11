import type { ReactNode } from "react";
import { AuthHeader } from "./auth-header";
import styles from "./auth.module.css";

type AuthShellProps = {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: ReactNode;
  featureTitle: string;
  featureCopy: string;
};

export function AuthShell({
  children,
  eyebrow,
  title,
  description,
  featureTitle,
  featureCopy,
}: AuthShellProps) {
  return (
    <main className={styles.page}>
      <AuthHeader />

      <section className={styles.visual} aria-hidden="true">
        <div>
          <h2>{featureTitle}</h2>
          <p>{featureCopy}</p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <div className={styles.description}>{description}</div>
          {children}
          <p className={styles.secure}>▢ Secure access. Your information is protected.</p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© Moviera Cinema. All rights reserved.</span>
        <div>
          <span>Privacy Policy</span>
          <span>Terms of Use</span>
        </div>
      </footer>
    </main>
  );
}
