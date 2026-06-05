import type { Metadata } from "next";
import { SiteMenu } from "@/components/layout/SiteMenu";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThrushCross Verify",
  description: "FSVP supplier verification for agricultural commodity imports into the United States."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SiteMenu />
        {children}
      </body>
    </html>
  );
}
