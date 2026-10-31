/**
 * Server-side helpers for proxying the Wallhaven API.
 *
 * Why a proxy is needed:
 *  - wallhaven.cc/api/* sends NO `Access-Control-Allow-Origin` header,
 *    so browsers block direct fetch() calls (CORS).
 *  - The old public proxy (proxy.vmlabs.su) is dead, which broke the site.
 *  - A Next.js route handler does the request server-side (no CORS) and
 *    falls back to public online proxies when the direct request fails.
 */

export const WALLHAVEN_API = "https://wallhaven.cc/api/v1";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Hosts allowed through the /api/img image proxy (SSRF guard). */
export const ALLOWED_IMAGE_HOSTS = [
  "wallhaven.cc",
  "w.wallhaven.cc",
  "th.wallhaven.cc",
  "whvn.cc",
];

/** Online CORS proxies that return raw response body. */
export const ONLINE_DIRECT_PROXIES = [
  (url: string) => `https://cors.tools/proxy?url=${encodeURIComponent(url)}`,
  (url: string) => `https://proxy.cors.dev/${url}`,
];

/** Online CORS proxies that wrap response body in `{ contents: string }`. */
export const ONLINE_JSON_PROXIES = [
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
];

/** Online raw proxies used as fallbacks for image bytes. */
export const ONLINE_RAW_PROXIES = [
  (url: string) => `https://cors.tools/proxy?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

export interface WallhavenThumbs {
  large: string;
  original: string;
  small: string;
}

export interface Wallpaper {
  id: string;
  url: string;
  short_url: string;
  views: number;
  favorites: number;
  source: string;
  purity: "sfw" | "sketchy" | "nsfw";
  category: "general" | "anime" | "people";
  dimension_x: number;
  dimension_y: number;
  resolution: string;
  ratio: string;
  file_size: number;
  file_type: string;
  created_at: string;
  colors: string[];
  path: string;
  thumbs: WallhavenThumbs;
}

export interface SearchResponse {
  data: Wallpaper[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    query: string;
    seed: string;
  };
}

export interface WallpaperDetailResponse {
  data: Wallpaper & {
    uploader: { username: string; avatar: string };
    tags: { id: number; name: string; alias?: string }[];
  };
}

/* ------------------------------------------------------------------ */
/* Tiny in-memory cache (avoids hammering Wallhaven's rate limits).    */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { expires: number; value: unknown }>();

export async function cachedFetchJson<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value as T;

  // Opportunistic cleanup when the map grows.
  if (cache.size > 400) {
    for (const [k, v] of cache) {
      if (v.expires < now) cache.delete(k);
    }
  }

  const value = await loader();
  cache.set(key, { expires: now + ttlMs, value });
  return value;
}

/* ------------------------------------------------------------------ */
/* Fetch helpers with fallback to online proxies.                      */
/* ------------------------------------------------------------------ */

export async function fetchTextWithFallback(url: string): Promise<string> {
  // 1) Direct server-side request (no CORS on the server).
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://wallhaven.cc/",
        Accept: "application/json, text/plain, */*",
      },
      cache: "no-store",
    });
    if (res.ok) return await res.text();
  } catch {
    // ignore and try proxies
  }

  // 2) Online pass-through CORS proxies (cors.tools, proxy.cors.dev).
  for (const build of ONLINE_DIRECT_PROXIES) {
    try {
      const res = await fetch(build(url), {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
      });
      if (res.ok) return await res.text();
    } catch {
      // try next proxy
    }
  }

  // 3) Online JSON-wrapped CORS proxies (allorigins.get).
  for (const build of ONLINE_JSON_PROXIES) {
    try {
      const res = await fetch(build(url), {
        headers: { "User-Agent": USER_AGENT },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          contents?: string;
          status?: { http_code?: number };
        };
        if (data.status?.http_code === 200 && typeof data.contents === "string") {
          return data.contents;
        }
      }
    } catch {
      // try next proxy
    }
  }

  throw new Error(`All upstream attempts failed for ${url}`);
}

export async function fetchJsonWithFallback<T>(url: string): Promise<T> {
  const text = await fetchTextWithFallback(url);
  return JSON.parse(text) as T;
}