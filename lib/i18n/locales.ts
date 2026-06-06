export const LOCALE_COOKIE = "fsvp_locale";
export const LOCALES = ["en", "ar", "fr", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const RTL_LOCALES: Locale[] = ["ar"];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  es: "Español",
};

export function isRTL(locale: Locale) {
  return RTL_LOCALES.includes(locale);
}

export function isValidLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}
