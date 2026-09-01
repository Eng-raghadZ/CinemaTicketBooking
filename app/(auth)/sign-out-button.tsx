"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/auth/client";
import { useAppPreferences } from "@/components/app-providers";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const { locale } = useAppPreferences();

  async function handleSignOut() {
    setPending(true);

    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="sign-out-button" type="button" onClick={handleSignOut} disabled={pending}>
      {pending ? (locale === "ar" ? "جارٍ الخروج..." : "Signing out...") : (locale === "ar" ? "تسجيل الخروج" : "Sign out")}
    </button>
  );
}
