import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

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
    <html lang="en-GB" suppressHydrationWarning className={`${dmSans.variable} ${gtUltra.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
