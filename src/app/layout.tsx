import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIZARRE ★ VISION",
  description:
    "Bizarre Vision — Wallhaven viewer with infinite scroll, API proxied server-side, images with multi-proxy fallback.",
};

export const viewport = {
  themeColor: "#07060b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}