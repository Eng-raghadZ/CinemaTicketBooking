"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/auth/client";
import { useAppPreferences } from "@/components/app-providers";
import { SiteHeader } from "@/components/site-header";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const { locale } = useAppPreferences();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState(""); const [pending, setPending] = useState(false);
  const t = locale === "ar" ? { eyebrow:"أهلًا بعودتك",title:"قصتك التالية بانتظارك.",story:"أدر السينما وفريق العمل ومواعيد العرض من مساحة واحدة صُممت لتكون واضحة وسريعة.",secure:"دخول آمن",scoped:"صلاحيات دقيقة",bilingual:"تجربة ثنائية اللغة",cardTitle:"تسجيل الدخول",cardIntro:"أدخل بياناتك للمتابعة إلى لوحة التحكم.",email:"البريد الإلكتروني",password:"كلمة المرور",submit:"تسجيل الدخول",pending:"جارٍ تسجيل الدخول...",invalid:"البريد الإلكتروني أو كلمة المرور غير صحيحة.",noAccount:"ليس لديك حساب؟",create:"أنشئ حسابًا" } : { eyebrow:"Welcome back",title:"Your next story is waiting.",story:"Manage your cinema, team, and showtimes from one space designed to feel clear and effortless.",secure:"Secure access",scoped:"Scoped permissions",bilingual:"Bilingual experience",cardTitle:"Sign in",cardIntro:"Enter your details to continue to your dashboard.",email:"Email address",password:"Password",submit:"Sign in",pending:"Signing in...",invalid:"Invalid email or password.",noAccount:"Don’t have an account?",create:"Create one" };
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setErrorMessage(""); setPending(true); const { error } = await createBrowserSupabaseClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password }); if (error) { setErrorMessage(t.invalid); setPending(false); return; } router.replace(redirectTo); router.refresh(); }
  return <div className="auth-page"><SiteHeader /><main className="auth-layout">
    <section className="auth-story"><p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p>{t.story}</p><div className="feature-row"><span className="feature-chip">{t.secure}</span><span className="feature-chip">{t.scoped}</span><span className="feature-chip">{t.bilingual}</span></div></section>
    <section className="auth-card" aria-labelledby="login-title"><h2 id="login-title">{t.cardTitle}</h2><p className="card-intro">{t.cardIntro}</p>
      <form className="auth-form" onSubmit={handleSubmit}><label className="field"><span className="field-label">{t.email}</span><input type="email" name="email" autoComplete="email" required value={email} placeholder="name@example.com" onChange={e=>setEmail(e.target.value)} /></label><label className="field"><span className="field-label">{t.password}</span><input type="password" name="password" autoComplete="current-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} /></label>{errorMessage&&<p className="form-message error" role="alert">{errorMessage}</p>}<button className="primary-button" type="submit" disabled={pending}>{pending?t.pending:t.submit}</button></form>
      <p className="auth-switch">{t.noAccount} <Link className="text-link" href="/signup">{t.create}</Link></p>
    </section>
  </main></div>;
}
