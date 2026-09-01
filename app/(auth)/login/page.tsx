import { LoginForm } from "./login-form";
import { safeInternalRedirectPath } from "@/lib/auth/redirect";
type LoginPageProps = { searchParams: Promise<{ redirectTo?: string }> };
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  return <LoginForm redirectTo={safeInternalRedirectPath(params.redirectTo)} />;
}
