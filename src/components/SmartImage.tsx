"use client";

import { useState } from "react";
import type { ImgHTMLAttributes } from "react";

/**
 * Client-side image load chain:
 *  1. direct Wallhaven CDN URL (referrerPolicy=no-referrer bypasses hotlink checks)
 *  2. online raw proxy (allorigins)
 *  3. our own server-side /api/img proxy (most reliable, streams through Next.js)
 *
 * If an attempt fails, the <img> onError handler advances to the next proxy.
 */
const IMAGE_PROXIES: Array<(url: string) => string> = [
  (url) => url,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `/api/img?url=${encodeURIComponent(url)}`,
];

interface SmartImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

export default function SmartImage({ src, alt, ...rest }: SmartImageProps) {
  const [idx, setIdx] = useState(0);
  const lastIndex = IMAGE_PROXIES.length - 1;
  const current = IMAGE_PROXIES[Math.min(idx, lastIndex)](src);

  return (
    <img
      src={current}
      alt={alt}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={() => setIdx((i) => (i < lastIndex ? i + 1 : i))}
      {...rest}
    />
  );
}