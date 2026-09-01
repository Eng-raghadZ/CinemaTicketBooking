import Link from "next/link";
import { LoginForm } from "./login-form";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";
import styles from "./login.module.css";

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const requestedPath = params.redirectTo;

  // Prevent external/open redirects.
  const redirectTo = safeInternalRedirectPath(requestedPath);

  return (
    <main className={styles.wrapper}>
      <div className={styles.brandPanel}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Moviera
        </Link>
        <div>
          <p className={styles.brandTagline}>WELCOME BACK</p>
          <h1 className={styles.brandHeadline}>
            Every great story starts with a seat.
          </h1>
        </div>
      </div>

      <div className={styles.formPanel}>
        <p className={styles.formEyebrow}>SIGN IN</p>
        <h2 className={styles.formHeading}>Access your account</h2>
        <p className={styles.formIntro}>
          Sign in to manage your cinemas, staff, and account.
        </p>

        <LoginForm redirectTo={redirectTo} />

        <p className={styles.signupLink}>
          Don&apos;t have an account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </main>
  );
}
