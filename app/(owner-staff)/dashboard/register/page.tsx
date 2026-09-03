import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { RegisterCinemaForm } from "./register-form";
import { BackLink } from "@/components/back-link";

export default async function RegisterCinemaPage() {
  // Defense in depth: middleware already blocks unauthenticated requests to
  // /dashboard/*, but this route must be independently correct per
  // docs/security.md's layered model.
  await requireAuthenticatedUser();

  return (
    <main>
      <BackLink href="/dashboard" label="Dashboard" />
      <h1>Register a new cinema</h1>
      <p>
        Your cinema stays private until a platform administrator approves it.
        You&apos;ll automatically become its owner once it&apos;s created.
      </p>
      <RegisterCinemaForm />
    </main>
  );
}
