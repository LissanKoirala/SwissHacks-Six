import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
