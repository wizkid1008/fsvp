import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isValidLocale, LOCALE_COOKIE, type Locale } from "./locales";
import { getMessages } from "./index";

export { LOCALE_COOKIE } from "./locales";

export function getLocale(): Locale {
  const cookieStore = cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return value && isValidLocale(value) ? value : DEFAULT_LOCALE;
}

export function useServerMessages() {
  const locale = getLocale();
  return { messages: getMessages(locale), locale };
}
