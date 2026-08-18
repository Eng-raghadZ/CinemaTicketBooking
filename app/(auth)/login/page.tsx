import { LoginForm } from "./login-form";
import Link from "next/link";

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const requestedPath = params.redirectTo;

  // Prevent external/open redirects.
  const redirectTo =
    requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";

  return (
    <main>
      <h1>Sign in</h1>
      <p>Sign in to manage your cinemas, staff, and account.</p>
      <LoginForm redirectTo={redirectTo} />
      <p>
        Don&apos;t have an account? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}