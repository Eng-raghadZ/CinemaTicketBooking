"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Locale = "en" | "ar";
type Theme = "dark" | "light";

type AppPreferences = {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  toggleTheme: () => void;
};

const PreferencesContext = createContext<AppPreferences | null>(null);

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const savedLocale = localStorage.getItem("moviera-locale");
    const savedTheme = localStorage.getItem("moviera-theme");
    if (savedLocale === "ar" || savedLocale === "en") setLocaleState(savedLocale);
    if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
  }, [locale, theme]);

  function setLocale(nextLocale: Locale) {
    setLocaleState(nextLocale);
    localStorage.setItem("moviera-locale", nextLocale);
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("moviera-theme", nextTheme);
  }

  return (
    <PreferencesContext.Provider value={{ locale, theme, setLocale, toggleTheme }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function useAppPreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("useAppPreferences must be used inside AppProviders");
  return context;
}

export function LocalizedText({ en, ar }: { en: ReactNode; ar: ReactNode }) {
  const { locale } = useAppPreferences();
  return <>{locale === "ar" ? ar : en}</>;
}
