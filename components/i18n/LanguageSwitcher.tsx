"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { Globe } from "lucide-react";
import { LOCALES, LOCALE_LABELS, LOCALE_COOKIE, type Locale } from "@/lib/i18n/locales";

export function LanguageSwitcher({ currentLocale, variant = "header" }: { currentLocale: Locale; variant?: "header" | "menu" }) {
  const [open, setOpen] = useState(false);

  function select(locale: Locale) {
    document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
    setOpen(false);
    window.location.reload();
  }

  if (variant === "menu") {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 border border-white/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 hover:border-white hover:text-white transition"
        >
          <Globe className="h-3.5 w-3.5" />
          {LOCALE_LABELS[currentLocale]}
          <svg className="h-3 w-3 opacity-60" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-white/10 bg-black shadow-xl">
              {LOCALES.map((locale) => (
                <button
                  key={locale}
                  onClick={() => select(locale)}
                  className={`w-full px-4 py-2.5 text-left text-sm font-bold uppercase tracking-wider transition ${
                    locale === currentLocale
                      ? "bg-white text-black"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {LOCALE_LABELS[locale]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 border border-black/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-black/60 hover:border-black hover:text-black transition"
      >
        <Globe className="h-3.5 w-3.5" />
        {LOCALE_LABELS[currentLocale]}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-line bg-white shadow-xl overflow-hidden">
            {LOCALES.map((locale) => (
              <button
                key={locale}
                onClick={() => select(locale)}
                className={`w-full px-4 py-2.5 text-left text-sm transition ${
                  locale === currentLocale
                    ? "bg-forest text-white font-semibold"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {LOCALE_LABELS[locale]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
