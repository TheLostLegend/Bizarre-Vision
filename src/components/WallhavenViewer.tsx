"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import SmartImage from "./SmartImage";
import type {
  SearchResponse,
  Wallpaper,
  WallpaperDetailResponse,
} from "@/lib/wallhaven";

type WallpaperDetail = WallpaperDetailResponse["data"];

const WALLHAVEN_API = "https://wallhaven.cc/api/v1";

async function fetchWithClientProxyFallback<T>(
  localPath: string,
  upstreamUrl: string,
  signal?: AbortSignal,
): Promise<T> {
  const isStaticHost =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith(".github.io") ||
      window.location.protocol === "file:");

  if (!isStaticHost) {
    try {
      const res = await fetch(localPath, { signal });
      if (res.ok) {
        const json = (await res.json()) as T & { data?: unknown };
        if (json && typeof json === "object" && "data" in json && json.data) {
          return json;
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }

  const directProxies = [
    `https://cors.tools/proxy?url=${encodeURIComponent(upstreamUrl)}`,
    `https://proxy.cors.dev/${upstreamUrl}`,
  ];

  for (const proxyUrl of directProxies) {
    try {
      const res = await fetch(proxyUrl, { signal });
      if (res.ok) {
        const json = (await res.json()) as T & { data?: unknown };
        if (json && typeof json === "object" && "data" in json && json.data) {
          return json;
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
    }
  }

  const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(upstreamUrl)}`;
  const res = await fetch(allOriginsUrl, { signal });
  if (res.ok) {
    const wrapper = (await res.json()) as { contents?: string };
    if (wrapper?.contents) {
      const parsed = JSON.parse(wrapper.contents) as T & { data?: unknown };
      if (parsed && typeof parsed === "object" && "data" in parsed && parsed.data) {
        return parsed;
      }
    }
  }

  throw new Error("Wallhaven API unreachable through all proxies. Please retry.");
}

const COLOR_OPTIONS: Array<[string, string]> = [
  ["660000", "DkRed"],
  ["990000", "Red"],
  ["cc0000", "Vivid Red"],
  ["cc3333", "Crimson"],
  ["ea4c88", "Rose"],
  ["993399", "Purple"],
  ["663399", "Violet"],
  ["333399", "Indigo"],
  ["0066cc", "Blue"],
  ["0099cc", "Sky Blue"],
  ["66cccc", "Turquoise"],
  ["77cc33", "Lime"],
  ["669900", "Olive"],
  ["336600", "DkGreen"],
  ["666600", "Drab"],
  ["999900", "Moss"],
  ["cccc33", "Mustard"],
  ["ffff00", "Yellow"],
  ["ffcc33", "Gold"],
  ["ff9900", "Orange"],
  ["ff6600", "Pumpkin"],
  ["cc6633", "Rust"],
  ["996633", "Tan"],
  ["663300", "Brown"],
  ["000000", "Black"],
  ["999999", "Gray"],
  ["cccccc", "LtGray"],
  ["ffffff", "White"],
  ["424153", "Charcoal"],
];

export default function WallhavenViewer() {
  const formRef = useRef<HTMLFormElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const lastPageRef = useRef(1);

  const [wallpapers, setWallpapers] = useState<Wallpaper[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<Wallpaper | null>(null);
  const [detail, setDetail] = useState<WallpaperDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeColor, setActiveColor] = useState("");

  const [helpOpen, setHelpOpen] = useState(false);
  const [blur, setBlur] = useState(false);

  const getControl = useCallback((name: string) => {
    const form = formRef.current;
    if (!form) return null;
    return form.elements.namedItem(name) as unknown as
      | HTMLInputElement
      | HTMLSelectElement
      | null;
  }, []);

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      loadingRef.current = true;
      if (append) setLoadingMore(true);
      else {
        setInitialLoading(true);
        setError(null);
      }

      const form = formRef.current;
      const params = new URLSearchParams();
      if (form) {
        const fd = new FormData(form);
        for (const [key, value] of fd.entries()) {
          if (key === "colors" && value === "") continue;
          params.append(key, String(value));
        }
      }
      params.set("page", String(pageNum));

      try {
        const qs = params.toString();
        const json = await fetchWithClientProxyFallback<SearchResponse>(
          `/api/search?${qs}`,
          `${WALLHAVEN_API}/search?${qs}`,
          controller.signal,
        );
        setWallpapers((prev) => (append ? [...prev, ...json.data] : json.data));
        pageRef.current = json.meta.current_page;
        lastPageRef.current = json.meta.last_page;
        setPage(json.meta.current_page);
        setLastPage(json.meta.last_page);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load wallpapers",
        );
      } finally {
        if (abortRef.current === controller) {
          loadingRef.current = false;
          setInitialLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    loadPage(1, false);
  }, [loadPage]);

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          !loadingRef.current &&
          pageRef.current < lastPageRef.current
        ) {
          loadPage(pageRef.current + 1, true);
        }
      },
      { rootMargin: "1000px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadPage]);

  // Blur preference persistence
  useEffect(() => {
    try {
      setBlur(localStorage.getItem("bizarre-blur") === "1");
    } catch {
      // ignore
    }
  }, []);

  const toggleBlur = () => {
    setBlur((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("bizarre-blur", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    loadPage(1, false);
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // clipboard unavailable
    }
  };

  const openExpanded = async (w: Wallpaper) => {
    setExpanded(w);
    setDetail(null);
    setDetailLoading(true);
    const qInput = getControl("q") as HTMLInputElement | null;
    const colorSelect = getControl("colors") as HTMLSelectElement | null;
    setActiveTags(
      (qInput?.value ?? "")
        .split(" ")
        .filter((t) => t.startsWith("+"))
        .map((t) => t.slice(1)),
    );
    setActiveColor(colorSelect?.value ?? "");
    try {
      const json = await fetchWithClientProxyFallback<WallpaperDetailResponse>(
        `/api/wallpaper?id=${encodeURIComponent(w.id)}`,
        `${WALLHAVEN_API}/w/${encodeURIComponent(w.id)}`,
      );
      if (json.data) setDetail(json.data);
    } catch {
      // details unavailable — fall back to list data
    }
    setDetailLoading(false);
  };

  const closeExpanded = useCallback(() => setExpanded(null), []);

  const toggleTag = (tagName: string) => {
    const input = getControl("q") as HTMLInputElement | null;
    if (!input) return;
    const parts = input.value.split(" ").filter(Boolean);
    const tag = `+${tagName}`;
    const idx = parts.indexOf(tag);
    if (idx >= 0) parts.splice(idx, 1);
    else parts.push(tag);
    input.value = parts.join(" ");
    setActiveTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName],
    );
    loadPage(1, false);
  };

  const toggleColor = (color: string) => {
    const select = getControl("colors") as HTMLSelectElement | null;
    if (!select) return;
    const next = select.value === color ? "" : color;
    select.value = next;
    setActiveColor(next);
    loadPage(1, false);
  };

  const hasMore = page < lastPage;

  return (
    <div className="viewer">
      <div className="bg-fx" aria-hidden="true">
        <span className="gogogo">ゴゴゴ</span>
      </div>
      <header className="site-header">
        <div className="brand">
          <span className="brand-star" aria-hidden="true">
            ★
          </span>
          <a
            href=""
            className="title-link"
            onClick={(e) => e.preventDefault()}
          >
            BIZARRE <span>VISION</span>
          </a>
          <span className="logo-mark">ゴゴゴ</span>
        </div>
        <div className="header-tag">Speedwagon Foundation · Wallpaper Archive</div>
        <div className="header-actions">
          <button
            id="blurToggle"
            className={blur ? "blur-btn-active" : ""}
            onClick={toggleBlur}
          >
            Blur
          </button>
          <button id="helpBtn" onClick={() => setHelpOpen(true)}>
            ?
          </button>
        </div>
      </header>

      <form id="searchForm" ref={formRef} onSubmit={onSubmit}>
        <input className="query-input" name="q" placeholder="Query" />
        <select name="categories" defaultValue="111">
          <option value="111">All</option>
          <option value="100">Common</option>
          <option value="010">Anime</option>
          <option value="001">People</option>
        </select>
        <select name="sorting" defaultValue="toplist">
          <option value="toplist">Toplist</option>
          <option value="date_added">Date added</option>
          <option value="relevance">Relevance</option>
          <option value="views">Views</option>
          <option value="favorites">Favorites</option>
          <option value="random">Random</option>
        </select>
        <select name="topRange" defaultValue="6M">
          <option value="1d">1d</option>
          <option value="3d">3d</option>
          <option value="1w">1w</option>
          <option value="1M">1M</option>
          <option value="3M">3M</option>
          <option value="6M">6M</option>
          <option value="1y">1y</option>
          <option value="2y">2y</option>
        </select>
        <select name="purity" defaultValue="100">
          <option value="100">sfw</option>
          <option value="110">no way!</option>
        </select>
        <input name="atleast" placeholder="Min (1920x1080)" />
        <select name="colors" defaultValue="">
          <option value="">All colors</option>
          {COLOR_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit">Search</button>
      </form>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => loadPage(1, false)}>Retry</button>
        </div>
      )}

      <div id="grid" className={blur ? "blur-on" : ""}>
        {wallpapers.map((w) => (
          <div key={w.id} className="card" onClick={() => openExpanded(w)}>
            <SmartImage
              src={w.thumbs.small}
              alt={w.id}
              loading="lazy"
              className="card-img"
            />
            <div className="info" onClick={(e) => e.stopPropagation()}>
              <span>{w.resolution}</span>
              <button
                className="id-link"
                onClick={() => copyId(w.id)}
                title="Copy ID"
              >
                {w.id}
              </button>
            </div>
          </div>
        ))}
        {initialLoading &&
          Array.from({ length: 18 }).map((_, i) => (
            <div key={`sk-${i}`} className="card skeleton" />
          ))}
      </div>

      <div id="sentinel" ref={sentinelRef} />
      {loadingMore && <div className="loader">ゴゴゴ LOADING MORE ゴゴゴ</div>}
      {!initialLoading && !hasMore && wallpapers.length > 0 && (
        <div className="loader">★ The World has stopped — no more wallpapers ★</div>
      )}
      {!initialLoading && !error && wallpapers.length === 0 && (
        <div className="loader">やれやれ… NO RESULTS — try different filters</div>
      )}

      <footer>
        <span>
          Page {page} / {lastPage}
        </span>
        <span className="foundation-seal">★ Speedwagon Foundation ★</span>
        <span className="proxy-note">
          API: server proxy · images: direct → allorigins → local
        </span>
        <span>{wallpapers.length} loaded</span>
      </footer>

      {/* Expand overlay */}
      {expanded && (
        <div
          className="expand-overlay visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeExpanded();
          }}
        >
          <div className="expanded-card">
            <SmartImage
              key={expanded.id}
              src={expanded.path}
              alt={expanded.id}
              loading="eager"
              className="expanded-img"
            />
            <div className="expanded-content">
              <div className="expanded-title">
                <a href={expanded.url} target="_blank" rel="noreferrer">
                  {expanded.id}
                </a>
                <button onClick={closeExpanded}>×</button>
              </div>

              <div className="meta-grid">
                <MetaRow
                  label="Resolution"
                  value={detail?.resolution ?? expanded.resolution}
                />
                <MetaRow
                  label="Views"
                  value={detail ? formatNumber(detail.views) : "…"}
                />
                <MetaRow
                  label="Favorites"
                  value={detail ? formatNumber(detail.favorites) : "…"}
                />
                <MetaRow
                  label="Uploader"
                  value={detail?.uploader.username ?? "…"}
                />
                <MetaRow label="Category" value={detail?.category ?? "…"} />
                <MetaRow label="Purity" value={detail?.purity ?? "…"} />
                <MetaRow
                  label="File size"
                  value={detail ? formatBytes(detail.file_size) : "…"}
                />
                <MetaRow label="Created" value={detail?.created_at ?? "…"} />
              </div>

              {detailLoading && <div className="loader">LOADING DETAILS…</div>}

              {detail && (
                <>
                  <div className="color-strip">
                    {detail.colors.map((c) => {
                      const hex = c.slice(1);
                      return (
                        <div
                          key={c}
                          className={
                            activeColor === hex
                              ? "color-block-active"
                              : "color-block"
                          }
                          style={{ background: c }}
                          title={c}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleColor(hex);
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="tag-list">
                    {detail.tags.map((t) => (
                      <span
                        key={t.id}
                        className={`tag ${
                          activeTags.includes(t.name) ? "active" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTag(t.name);
                        }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help overlay */}
      {helpOpen && (
        <div
          id="helpOverlay"
          className="visible"
          onClick={(e) => {
            if (
              e.target === e.currentTarget ||
              (e.target as HTMLElement).classList.contains("close")
            ) {
              setHelpOpen(false);
            }
          }}
        >
          <div className="helpModal">
            <div className="helpTitle">
              <h2>Search tips</h2>
              <button className="close" onClick={() => setHelpOpen(false)}>
                ×
              </button>
            </div>
            <p className="intro">
              Fine-tune results using tags, filters and sorting. Most fields are
              optional.
            </p>
            <section>
              <h3>Query</h3>
              <p>Use keywords or tags to describe what you want.</p>
              <ul className="chips">
                <li>
                  <code>tag</code>
                </li>
                <li>
                  <code>-exclude</code>
                </li>
                <li>
                  <code>+required</code>
                </li>
                <li>
                  <code>@user</code>
                </li>
              </ul>
            </section>
            <section>
              <h3>Sorting</h3>
              <p>
                <code>Toplist</code> works best with a time range.
              </p>
            </section>
            <section>
              <h3>Quality filters</h3>
              <p>Limit results by minimum resolution or dominant color.</p>
              <ul className="chips">
                <li>
                  <code>1920x1080</code>
                </li>
                <li>
                  <span className="color-dot" style={{ background: "#0099cc" }} />
                  Blue
                </li>
                <li>
                  <span className="color-dot" style={{ background: "#77cc33" }} />
                  Lime
                </li>
                <li>
                  <span className="color-dot" style={{ background: "#ffffff" }} />
                  White
                </li>
              </ul>
            </section>
            <section>
              <h3>Navigation</h3>
              <p>Scroll down — new wallpapers load automatically.</p>
            </section>
            <section>
              <h3>Why it works</h3>
              <p>
                Wallhaven&apos;s API sends no CORS headers, so the browser cannot
                call it directly. This app proxies the API through the server
                and loads images directly from the CDN with fallbacks to online
                proxies, then to the local image proxy.
              </p>
            </section>
            <div className="recs">
              <span>
                Extra inspiration →{" "}
                <a
                  href="https://github.com/the-speedwagon-foundation/humanitarian-cargo/archive/refs/heads/main.zip"
                  target="_blank"
                  rel="noreferrer"
                >
                  Foundation recommendations
                </a>
              </span>
            </div>
          </div>
        </div>
      )}

      <EscapeClose onEscape={closeExpanded} />
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function EscapeClose({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape]);
  return null;
}

function formatNumber(n: number) {
  return n.toLocaleString("en-US");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}