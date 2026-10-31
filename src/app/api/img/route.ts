import { NextRequest } from "next/server";
import { ALLOWED_IMAGE_HOSTS, ONLINE_RAW_PROXIES, USER_AGENT } from "@/lib/wallhaven";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

/**
 * Image proxy: streams an image from Wallhaven's CDN through our server.
 * This bypasses hotlink/referer restrictions and CORS in one hop.
 * Only wallhaven hosts are allowed (SSRF guard).
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new Response("Missing url", { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  const hostOk = ALLOWED_IMAGE_HOSTS.some(
    (h) => url.hostname === h || url.hostname.endsWith(`.${h}`),
  );
  if (!hostOk) {
    return new Response("Forbidden host", { status: 403 });
  }

  const headers = {
    "User-Agent": USER_AGENT,
    Referer: "https://wallhaven.cc/",
  };

  // 1) Direct fetch from Wallhaven's CDN.
  try {
    const res = await fetch(url.toString(), {
      headers,
      cache: "force-cache",
      next: { revalidate: 86400 },
    });
    if (res.ok && res.body) {
      const contentType = res.headers.get("content-type") || "image/jpeg";
      return new Response(res.body, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": CACHE_CONTROL,
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  } catch {
    // fall through to online proxies
  }

  // 2) Online raw proxies (works from some networks).
  for (const build of ONLINE_RAW_PROXIES) {
    try {
      const res = await fetch(build(url.toString()), { cache: "no-store" });
      if (res.ok && res.body) {
        const contentType = res.headers.get("content-type") || "image/jpeg";
        return new Response(res.body, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": CACHE_CONTROL,
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    } catch {
      // try next proxy
    }
  }

  return new Response("Image proxy failed", { status: 502 });
}