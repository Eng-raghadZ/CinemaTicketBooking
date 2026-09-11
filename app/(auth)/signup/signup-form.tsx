"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/auth/client";
import styles from "../auth.module.css";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.5-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.5 5.5-9.5 5.5S2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleGoogleSignUp() {
    setMessage("");
    setErrorMessage("");
    setPending(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback?next=/`,
      },
    });
    if (error) {
      setErrorMessage("Google sign up is not available right now.");
      setPending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!phone.trim()) {
      setErrorMessage("Phone number is required.");
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
          phone: phone.trim(),
        },
        emailRedirectTo: `${window.location.origin}/callback?next=/`,
      },
    });

    if (error) {
      setErrorMessage(
        "Unable to create the account. Check the entered information.",
      );
      setPending(false);
      return;
    }

    if (data.session) {
      router.replace("/");
      router.refresh();
      return;
    }

    setMessage("Account created. Check your email to confirm your account.");
    setPending(false);
  }

  return (
    <form
      className={`${styles.form} ${styles.signupCard}`}
      onSubmit={handleSubmit}
    >
      <label className={styles.field}>
        Full name
        <input
          name="fullName"
          autoComplete="name"
          required
          maxLength={200}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </label>

      <div className={styles.row}>
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
          Phone number
          <input
            type="tel"
            name="phone"
            autoComplete="tel"
            placeholder="+970"
            required
            minLength={7}
            maxLength={30}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </label>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          Password
          <span className={styles.inputWrap}>
            <input
              className={styles.passwordInput}
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="new-password"
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
              <EyeIcon />
            </button>
          </span>
        </label>

        <label className={styles.field}>
          Confirm password
          <span className={styles.inputWrap}>
            <input
              className={styles.passwordInput}
              type={showConfirmPassword ? "text" : "password"}
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <button
              className={styles.reveal}
              type="button"
              onClick={() => setShowConfirmPassword((value) => !value)}
              aria-label={
                showConfirmPassword ? "Hide password" : "Show password"
              }
              aria-pressed={showConfirmPassword}
            >
              <EyeIcon />
            </button>
          </span>
        </label>
      </div>

      <label className={styles.check}>
        <input type="checkbox" required />
        <span>
          I agree to the <em>Terms of Use</em> and <em>Privacy Policy</em>
        </span>
      </label>

      {errorMessage && (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )}
      {message && (
        <p className={styles.message} role="status">
          {message}
        </p>
      )}

      <button className={styles.primary} type="submit" disabled={pending}>
        {pending ? "Creating account..." : "Create account"}
      </button>
      <div className={styles.divider}>OR</div>
      <button
        className={styles.oauth}
        type="button"
        onClick={handleGoogleSignUp}
        disabled={pending}
      >
        <strong aria-hidden="true">G</strong> Continue with Google
      </button>
    </form>
  );
}
