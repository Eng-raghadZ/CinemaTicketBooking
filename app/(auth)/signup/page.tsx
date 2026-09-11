import Link from "next/link";
import { SignupForm } from "./signup-form";
import { AuthShell } from "../auth-shell";
import styles from "../auth.module.css";

export default function SignupPage() {
  return (
    <AuthShell
      eyebrow="Create your account"
      title="Join Moviera"
      description="Create an account to book tickets, manage reservations, and save your favorite cinemas."
      featureTitle="Join the Moviera experience."
      featureCopy="Book unforgettable movie moments and keep every ticket in one place."
    >
      <SignupForm />
      <p className={styles.switch}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
