import { BrandLogo } from "./brand-logo";
import { PreferenceControls } from "./preference-controls";

export function SiteHeader() {
  return (
    <header className="site-header">
      <BrandLogo />
      <PreferenceControls />
    </header>
  );
}
