"use client";

import { useEffect, useState, type ReactNode } from "react";

type HeaderFrameProps = {
  children: ReactNode;
};

export function HeaderFrame({ children }: HeaderFrameProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const updateHeader = () => setScrolled(window.scrollY > 12);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <header className={`site-header${scrolled ? " site-header-scrolled" : ""}`}>
      {children}
    </header>
  );
}
