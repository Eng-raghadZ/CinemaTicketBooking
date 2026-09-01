"use client";
import Link from "next/link";
import { LocalizedText } from "@/components/app-providers";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return <div className="home-page"><SiteHeader /><main className="hero">
    <p className="eyebrow"><LocalizedText en="The cinema, made seamless" ar="السينما، بتجربة أكثر سلاسة" /></p>
    <h1><LocalizedText en="Every great story starts with a seat." ar="كل قصة رائعة تبدأ من مقعد." /></h1>
    <p className="hero-copy"><LocalizedText en="Moviera brings cinemas, teams, and moviegoers together in one refined booking experience. Cinema management is available now; public booking is coming next." ar="تجمع Moviera دور السينما وفرق العمل وروّاد الأفلام في تجربة حجز واحدة متكاملة. إدارة السينما متاحة الآن، والحجز العام هو المرحلة القادمة." /></p>
    <div className="hero-actions"><Link className="primary-button" href="/login"><LocalizedText en="Sign in to Moviera" ar="تسجيل الدخول إلى Moviera" /></Link><Link className="secondary-button" href="/signup"><LocalizedText en="Create an account" ar="إنشاء حساب" /></Link></div>
    <p className="hero-note"><LocalizedText en="Cinema onboarding, staff access, screens, movies, and showtimes are ready." ar="تسجيل السينما وإدارة الطاقم والقاعات والأفلام ومواعيد العرض أصبحت جاهزة." /></p>
  </main></div>;
}
