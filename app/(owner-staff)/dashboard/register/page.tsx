import { requireAuthenticatedUser } from "@/lib/auth/guards";
import { RegisterCinemaForm } from "./register-form";
import ui from "@/app/ui.module.css";

export default async function RegisterCinemaPage() {
  // Defense in depth: middleware already blocks unauthenticated requests to
  // /dashboard/*, but this route must be independently correct per
  // docs/security.md's layered model.
  await requireAuthenticatedUser();

  return (
    <main className={ui.container} style={{ maxWidth: 560 }}>
      <div className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Register a new cinema</h1>
        <p className={ui.pageSubtitle}>
          Your cinema stays private until a platform administrator approves
          it. You&apos;ll automatically become its owner once it&apos;s
          created.
        </p>
      </div>
      <RegisterCinemaForm />
    </main>
  );
}
