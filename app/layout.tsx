import type { Metadata } from "next";
import { Barlow_Condensed, Bebas_Neue } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const bodyFont = Barlow_Condensed({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const displayFont = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Moviera — Cinema Management",
  description: "Cinema onboarding, staff, catalog, screens, and showtime management.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
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
