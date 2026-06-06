import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isValidLocale, type Locale } from "./locales";
import { getMessages } from "./index";

export const LOCALE_COOKIE = "fsvp_locale";

export function getLocale(): Locale {
  const cookieStore = cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return value && isValidLocale(value) ? value : DEFAULT_LOCALE;
}

export function useServerMessages() {
  const locale = getLocale();
  return { messages: getMessages(locale), locale };
}
