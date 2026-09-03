import Link from "next/link";
import { SignupForm } from "./signup-form";
import { BackLink } from "@/components/back-link";

export default function SignupPage() {
  return (
    <main className="auth-page">
      <section className="auth-story">
        <BackLink href="/" label="Home" />
        <p className="eyebrow">JOIN MOVIERA</p>
        <h1>Build the operating space behind every screening.</h1>
        <p>Create an account to register a cinema and manage the functionality currently available.</p>
      </section>
      <section className="auth-panel">
        <p className="eyebrow">CREATE ACCESS</p>
        <h2>Create account</h2>
        <SignupForm />
        <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
      </section>
    </main>
  );
}
