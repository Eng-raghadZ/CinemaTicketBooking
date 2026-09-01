"use client";

import { useAppPreferences } from "./app-providers";

export function PreferenceControls() {
  const { locale, theme, setLocale, toggleTheme } = useAppPreferences();

  return (
    <div className="preference-controls">
      <button
        className="icon-button"
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
      >
        {theme === "dark" ? "☼" : "☾"}
      </button>
      <button
        className="language-button"
        type="button"
        onClick={() => setLocale(locale === "en" ? "ar" : "en")}
        aria-label={locale === "en" ? "التبديل إلى العربية" : "Switch to English"}
      >
        {locale === "en" ? "العربية" : "EN"}
      </button>
    </div>
  );
}
