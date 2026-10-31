import { NextRequest } from "next/server";
import {
  WALLHAVEN_API,
  cachedFetchJson,
  fetchJsonWithFallback,
  type WallpaperDetailResponse,
} from "@/lib/wallhaven";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies: https://wallhaven.cc/api/v1/w/{id}
 * Cached for 10 minutes (wallpaper metadata is static).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return Response.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const target = `${WALLHAVEN_API}/w/${encodeURIComponent(id)}`;

  try {
    const data = await cachedFetchJson<WallpaperDetailResponse>(
      `w:${id}`,
      10 * 60_000,
      () => fetchJsonWithFallback<WallpaperDetailResponse>(target),
    );
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Wallpaper detail proxy failed:", err);
    return Response.json(
      { error: "Wallpaper details unavailable." },
      { status: 502 },
    );
  }
}