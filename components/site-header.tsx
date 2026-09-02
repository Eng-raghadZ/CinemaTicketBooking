import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/server";
import { HeaderFrame } from "@/components/header-frame";
import { SiteNavigation } from "@/components/site-navigation";

export async function SiteHeader() {
  const user = await getCurrentUserContext();

  return (
    <HeaderFrame>
      <Link className="site-brand" href="/" aria-label="Moviera home">
        <svg className="site-brand-mark" viewBox="0 0 48 58" aria-hidden="true">
          <path d="M8 48V13L21 7v41M17 48V18l13-6v36M26 48V22l13-6v32M4 48h40M4 54h40" />
        </svg>
        <span className="site-brand-copy">Moviera<small>CINEMA PLATFORM</small></span>
      </Link>
      <SiteNavigation isAuthenticated={Boolean(user)} />
    </HeaderFrame>
  );
}
