"use client";
import Link from "next/link";
import { LocalizedText } from "@/components/app-providers";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return <div className="home-page">
    <SiteHeader />
    <main className="hero">
      <div className="hero-content">
        <p className="eyebrow"><LocalizedText en="The cinema, made seamless" ar="السينما، بتجربة أكثر سلاسة" /></p>
        <h1><LocalizedText en="Every great story starts with a seat." ar="كل قصة رائعة تبدأ من مقعد." /></h1>
        <p className="hero-copy"><LocalizedText en={<>Moviera brings you closer to the films you love.<br />Discover. Book. Experience. All in one place.</>} ar={<>تقرّبك Moviera من الأفلام التي تحبها.<br />اكتشف. احجز. استمتع. كل ذلك في مكان واحد.</>} /></p>
        <div className="hero-actions"><Link className="primary-button" href="/login"><LocalizedText en="Sign in to Moviera" ar="تسجيل الدخول إلى Moviera" /></Link><Link className="secondary-button" href="/signup"><LocalizedText en="Create an account" ar="إنشاء حساب" /></Link></div>
      </div>
    </main>
  </div>;
}
