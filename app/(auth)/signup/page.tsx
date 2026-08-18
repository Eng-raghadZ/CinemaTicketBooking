import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main>
      <h1>Create account</h1>
      <p>Create an account to register a cinema or book tickets.</p>

      <SignupForm />

      <p>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}