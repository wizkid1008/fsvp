import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FSVP Compliance Platform",
  description: "Supplier documentation, readiness scoring, and reviewer workflows for FSVP programs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
