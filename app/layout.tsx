import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moviera — Cinema Management",
  description: "Cinema onboarding, staff, catalog, screens, and showtime management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <span className="footer-brand">MOVIERA<small>CINEMA PLATFORM</small></span>
          <span>Current management experience</span>
          <span>Phase 0–2 interfaces</span>
        </footer>
      </body>
    </html>
  );
}
