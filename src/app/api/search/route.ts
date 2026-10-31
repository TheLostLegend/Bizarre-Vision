import { NextRequest } from "next/server";
import {
  WALLHAVEN_API,
  cachedFetchJson,
  fetchJsonWithFallback,
  type SearchResponse,
} from "@/lib/wallhaven";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies: https://wallhaven.cc/api/v1/search?...
 * Server-side fetch bypasses browser CORS. Results are cached for 45s.
 */
export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.toString();
  const target = `${WALLHAVEN_API}/search${query ? `?${query}` : ""}`;

  try {
    const data = await cachedFetchJson<SearchResponse>(
      `search:${query}`,
      45_000,
      () => fetchJsonWithFallback<SearchResponse>(target),
    );
    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=45, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Search proxy failed:", err);
    return Response.json(
      { error: "Wallhaven API unreachable through all proxies. Please retry." },
      { status: 502 },
    );
  }
}