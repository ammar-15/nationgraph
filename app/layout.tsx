import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SLED Scout",
  description: "Finds SLED buying signals, matches them to vendors, and builds the campaign to win them.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
