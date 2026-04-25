import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Letterboxd Watchlist Picker",
  description: "Surrender the choice. We'll pull a film from your Letterboxd watchlist that fits the night.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
