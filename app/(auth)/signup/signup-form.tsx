"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/auth/client";
import ui from "@/app/ui.module.css";

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setPending(true);

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
        emailRedirectTo: `${window.location.origin}/callback?next=/dashboard`,
      },
    });

    if (error) {
      setErrorMessage("Unable to create the account. Check the entered information.");
      setPending(false);
      return;
    }

    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setMessage("Account created. Check your email to confirm your account.");
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className={ui.field}>
        <span className={ui.fieldLabel}>Full name</span>
        <input
          className={ui.input}
          name="fullName"
          autoComplete="name"
          required
          maxLength={200}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Email</span>
        <input
          className={ui.input}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Password</span>
        <input
          className={ui.input}
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Confirm password</span>
        <input
          className={ui.input}
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>

      {errorMessage && (
        <p role="alert" className={ui.alertError}>
          {errorMessage}
        </p>
      )}
      {message && (
        <p role="status" className={ui.alertSuccess}>
          {message}
        </p>
      )}

      <button type="submit" className={ui.buttonPrimary} disabled={pending} style={{ width: "100%", marginTop: 4 }}>
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
