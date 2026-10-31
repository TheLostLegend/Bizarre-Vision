import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "BIZARRE ★ VIEW",
  description:
    "Wallhaven proxy viewer with infinite scroll — API proxied server-side, images with multi-proxy fallback.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}