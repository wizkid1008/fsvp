"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Messages } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/locales";

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  t: (path: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  function t(path: string): string {
    return getNestedValue(messages as unknown as Record<string, unknown>, path);
  }

  return (
    <LocaleContext.Provider value={{ locale, messages, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
