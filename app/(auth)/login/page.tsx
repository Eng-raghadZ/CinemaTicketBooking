import { LoginForm } from "./login-form";
import Link from "next/link";
import { AuthShell } from "../auth-shell";
import styles from "../auth.module.css";

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Moviera Access"
      description={
        <>
          Your cinema. Your team. One control room.
          <br />
          Return to your cinemas, staff, screens, movies, and showtimes.
        </>
      }
      featureTitle="Your cinema. Your story."
      featureCopy="Manage every screen, schedule, and unforgettable movie experience."
    >
      <LoginForm />
      <p className={styles.switch}>
        New to Moviera? <Link href="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}
