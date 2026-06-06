import type { Locale } from "./locales";
import en from "./messages/en";
import ar from "./messages/ar";
import fr from "./messages/fr";
import es from "./messages/es";

export type { Messages } from "./messages/en";
export { type Locale, LOCALES, DEFAULT_LOCALE, RTL_LOCALES, LOCALE_LABELS, isRTL, isValidLocale } from "./locales";

const messages = { en, ar, fr, es } as const;

export function getMessages(locale: Locale) {
  return messages[locale] ?? messages.en;
}

// Nested key access helper: t(m, "nav.dashboard")
type PathsOf<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : T extends Record<string, unknown>
  ? { [K in keyof T & string]: PathsOf<T[K], Prefix extends "" ? K : `${Prefix}.${K}`> }[keyof T & string]
  : never;

type MessagePath = PathsOf<typeof en>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : path;
}

export function t(messages: typeof en, path: string): string {
  return getNestedValue(messages as unknown as Record<string, unknown>, path);
}
