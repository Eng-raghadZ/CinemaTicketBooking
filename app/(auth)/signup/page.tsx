import Link from "next/link";
import { SignupForm } from "./signup-form";
import styles from "../auth.module.css";

export default function SignupPage() {
  return (
    <main className={styles.wrapper}>
      <div className={styles.brandPanel}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Moviera
        </Link>
        <div>
          <p className={styles.brandTagline}>GET STARTED</p>
          <h1 className={styles.brandHeadline}>
            Register your cinema, invite your team, run your screens.
          </h1>
        </div>
      </div>

      <div className={styles.formPanel}>
        <p className={styles.formEyebrow}>CREATE ACCOUNT</p>
        <h2 className={styles.formHeading}>Create your account</h2>
        <p className={styles.formIntro}>
          Create an account to register a cinema or join one as staff.
        </p>

        <SignupForm />

        <p className={styles.footerLink}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
