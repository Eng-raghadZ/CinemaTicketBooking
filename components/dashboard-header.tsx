import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { PreferenceControls } from "./preference-controls";
import { SignOutButton } from "@/app/(auth)/sign-out-button";

export function DashboardHeader({ backHref }: { backHref?: string }) {
  return <header className="dashboard-header"><div className="dashboard-header-inner"><div className="header-start"><BrandLogo />{backHref && <Link className="header-back" href={backHref} aria-label="Back">←</Link>}</div><div className="header-actions"><PreferenceControls /><SignOutButton /></div></div></header>;
}
