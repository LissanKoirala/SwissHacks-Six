import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const gtUltra = localFont({
  src: "./fonts/GT-Ultra-Median-Light.woff2",
  weight: "300",
  variable: "--font-gt-ultra",
});

export const metadata: Metadata = {
  title: "Advisory Workbench",
  description:
    "Relationship-manager workbench — living client profiles, mandate-safe strategy proposals and conversation drafts. Advisory only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-GB" suppressHydrationWarning className={gtUltra.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
