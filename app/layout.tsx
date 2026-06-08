import type { Metadata } from "next";
import { SiteMenu } from "@/components/layout/SiteMenu";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { getLocale } from "@/lib/i18n/server";
import { getMessages, isRTL } from "@/lib/i18n";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThrushCross Verify",
  description: "FSVP supplier verification for agricultural commodity imports into the United States.",
  icons: {
    icon: "/favicon.ico"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const messages = getMessages(locale);
  const dir = isRTL(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <head>
        {/* Noto Sans Arabic for RTL support */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={dir === "rtl" ? "font-arabic" : ""}>
        <LocaleProvider locale={locale} messages={messages}>
          <SiteMenu />
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
