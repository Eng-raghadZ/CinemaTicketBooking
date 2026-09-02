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
    <main className="auth-page">
      <section className="auth-story">
        <p className="eyebrow">MOVIERA ACCESS</p>
        <h1>Your cinema. Your team. One control room.</h1>
        <p>Return to the management workspace for your cinemas, staff, screens, movies, and showtimes.</p>
      </section>
      <section className="auth-panel">
        <p className="eyebrow">WELCOME BACK</p>
        <h2>Sign in</h2>
        <p>Use your account credentials to continue.</p>
        <LoginForm redirectTo={redirectTo} />
        <p className="auth-switch">Don&apos;t have an account? <Link href="/signup">Create one</Link></p>
      </section>
    </main>
  );
}
