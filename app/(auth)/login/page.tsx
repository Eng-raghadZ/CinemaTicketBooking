import { LoginForm } from "./login-form";
import Link from "next/link";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const requestedPath = params.redirectTo;

  // Prevent external/open redirects.
  const redirectTo = safeInternalRedirectPath(requestedPath);

  return (
    <main className="auth-page login-page">
      <section className="auth-story login-story">
        <p className="eyebrow">CINEMA OPERATIONS</p>
        <h1>Welcome back</h1>
      </section>
      <section className="auth-panel login-panel">
        <h2>Sign in</h2>
        <p>Access your cinema management workspace.</p>
        <LoginForm redirectTo={redirectTo} />
        <p className="auth-switch">New to Moviera? <Link href="/signup">Create an account</Link></p>
      </section>
    </main>
  );
}
