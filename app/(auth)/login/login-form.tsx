"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/auth/client";
import styles from "../auth.module.css";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleGoogleSignIn() {
    setErrorMessage("");
    setPending(true);
    const supabase = createBrowserSupabaseClient();
    const callback = `${window.location.origin}/callback?next=/`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback },
    });
    if (error) {
      setErrorMessage("Google sign in is not available right now.");
      setPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setPending(true);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setErrorMessage("Invalid email or password.");
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.field}>
        Email address
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label className={styles.field}>
        Password
        <span className={styles.inputWrap}>
          <input
            className={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            className={styles.reveal}
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </span>
      </label>

      {errorMessage && <p className={styles.error} role="alert">{errorMessage}</p>}

      <button className={styles.primary} type="submit" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <div className={styles.divider}>OR</div>
      <button
        className={styles.oauth}
        type="button"
        onClick={handleGoogleSignIn}
        disabled={pending}
      >
        <strong aria-hidden="true">G</strong> Continue with Google
      </button>
    </form>
  );
}
