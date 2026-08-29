"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import { authedFetch } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import GradeEditor, { GradeBadge } from "@/components/GradeEditor";
import EmptyState from "@/components/EmptyState";
import FirstRunLibrary from "@/components/FirstRunLibrary";
import CatalogLinkPicker from "@/components/CatalogLinkPicker";
import CollectionStatsStrip from "@/components/CollectionStatsStrip";
import CollectionInsightSidebar from "@/components/CollectionInsightSidebar";
import RunCompletionWidget from "@/components/RunCompletionWidget";

// Module-scoped so it survives across component re-mounts within a tab
// (see the user-change-clear logic below for why that's usually right).
// Entries carry a `cachedAt` timestamp and are treated as stale past
// HYDRATION_CACHE_MAX_AGE_MS — added 2026-08-29 after a real incident: a
// tab left open for hours during live backend cover-relinking work cached
// an empty/mid-repair cover result and never re-checked it, since the
// original cache had no expiry at all. The underlying data was correct
// again within seconds (verified live against /api/library-hydrate
// directly), but the browser tab never found out. A hard refresh always
// fixed it (fresh page load = fresh module = empty cache) — this makes
// that automatic instead of requiring one.
const HYDRATION_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const hydrationCache = new Map();

function freshCacheEntry(key) {
  const entry = hydrationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > HYDRATION_CACHE_MAX_AGE_MS) return null;
  return entry.data;
}

const USER_COVER_UPLOAD_ENABLED = true;

function getLibraryHref(item, comic) {
  if (comic?.href) return comic.href;
  if (item?.gcd_issue_id != null) return `/issue/gcd-${item.gcd_issue_id}`;
  if (item?.comic_id != null) return `/comic/${item.comic_id}`;
  return "/library";
}

// Defensive normalize for user_cover_url. Older GradeEditor versions stored
// just the filename (`<uuid>.jpg`) instead of the full Supabase URL, which
// the browser then resolved as a relative path → 404. Existing DB rows were
// backfilled to absolute URLs, but new writes from any unrelated source
// path could regress this — so we normalize at render-time too.
function resolveUserCover(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supa) return null;
  // Bare filename: presumed to live at the root of the comic-covers bucket.
  return `${supa}/storage/v1/object/public/comic-covers/${value.replace(/^\/+/, "")}`;
}

function normalizePublisherName(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Unknown Publisher";
  if (["marvel", "marvel comics"].includes(lower)) return "Marvel";
  if (["dc", "dc comics"].includes(lower)) return "DC";
  if (["image", "image comics"].includes(lower)) return "Image";
  if (["boom", "boom!", "boom studios", "boom! studios"].includes(lower)) return "Boom";
  if (["idw", "idw publishing"].includes(lower)) return "IDW";
  if (["dark horse", "dark horse comics"].includes(lower)) return "Dark Horse";

  return raw;
}

function makeLibraryKey(item) {
  if (item?.gcd_issue_id != null) return `gcd-${item.gcd_issue_id}`;
  if (item?.comic_id != null) return String(item.comic_id);
  return null;
}

// Shared across all three view modes (list/grid/rows) — each computes its
// own totalCount/pageSize (item count for list/grid, group count for rows)
// and renders nothing when everything fits on one page, so a small
// collection never sees pagination chrome it doesn't need.
function PaginationBar({ page, setPage, totalCount, pageSize }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;
  const clamped = Math.min(page, totalPages);
  return (
    <div className="library-pagination">
      <button
        type="button"
        className="library-pagination-btn"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={clamped <= 1}
      >
        ← Prev
      </button>
      <span className="library-pagination-status">
        Page {clamped} of {totalPages}
      </span>
      <button
        type="button"
        className="library-pagination-btn"
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        disabled={clamped >= totalPages}
      >
        Next →
      </button>
    </div>
  );
}

export default function LibraryPage() {
  // useSearchParams below requires a Suspense boundary in Next 15+ for static
  // rendering. Without this, `next build` fails with a CSR-bailout prerender error.
  return (
    <Suspense fallback={null}>
      <LibraryPageContent />
    </Suspense>
  );
}

function LibraryPageContent() {
  const { collections, loading, loadError, refreshLibrary, removeFromCollection } = useLibrary();
  const { user, isPro, profile } = useAuth();
  const supabase = getSupabaseClient();

  const router = useRouter();
  const searchParams = useSearchParams();

  // Honor ?tab=wishlist (or ?tab=owned) on first load — used by the footer
  // "Wantlist" link and any other deep-link entry into the library.
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    return t === "wishlist" || t === "owned" ? t : "owned";
  });

  // Phase 3 unify — preview mode. URL `?view=public` (or localStorage memory
  // of the last choice) flips the library into a render that mirrors what
  // visitors see at /u/<username>: management chrome hidden (no CSV upload,
  // no inline GradeEditor, no Add Comic button, no catalog-linking panel),
  // stats clamped to public visibility per the owner's privacy toggles.
  // The toggle button at the top of the header lets the owner round-trip.
  // Initialize deterministically so server + initial client render match.
  // The previous version read localStorage in the useState initializer,
  // which only exists on the client — server returned "manage", client
  // could return "public", and React hydration would scream. Now we always
  // start at "manage" and sync from URL/storage in an effect on mount.
  const [previewMode, setPreviewMode] = useState("manage");
  const isPublicPreview = previewMode === "public";

  // Sync after mount: URL ?view= overrides stored preference. This is a
  // deliberate one-time read of browser-only state (URL/localStorage) —
  // see the comment above previewMode's declaration for why this can't be
  // a lazy useState initializer instead (that shape previously caused a
  // server/client hydration mismatch, since window doesn't exist on the
  // server render pass).
  useEffect(() => {
    const param = searchParams.get("view");
    if (param === "public" || param === "manage") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewMode(param);
      return;
    }
    const stored = window.localStorage.getItem("library-view-mode");
    if (stored === "public" || stored === "manage") {
      setPreviewMode(stored);
    }
    // searchParams is intentionally not in deps — we only want the URL/
    // storage handshake on initial mount. Manual toggles update state
    // directly via setPreviewMode in the tab onClick handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the last choice so a refresh keeps the same mode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("library-view-mode", previewMode);
  }, [previewMode]);
  const [comicIndex, setComicIndex] = useState(() => {
    const initial = {};
    for (const key of hydrationCache.keys()) {
      const data = freshCacheEntry(key);
      if (data) initial[key] = data;
    }
    return initial;
  });

  // hydrationCache is module-scoped and survives navigation/sign-out, which
  // means a previous account's hydrated covers can flash before the new
  // user's data loads. Wipe it whenever the active user changes — adjusted
  // during render (React's documented pattern for "reset state when an
  // identity prop changes") rather than in an effect, so there's no extra
  // stale-cache render in between. hydrationCache.clear() is idempotent, so
  // it's safe to run from render.
  const [lastHydrationUserId, setLastHydrationUserId] = useState(user?.id ?? null);
  if (lastHydrationUserId !== (user?.id ?? null)) {
    setLastHydrationUserId(user?.id ?? null);
    hydrationCache.clear();
    setComicIndex({});
  }
  const [csvResult, setCsvResult] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [gradeData, setGradeData] = useState({});
  // Phase 2 auto-market-values keyed by user_collections.id. Empty until
  // /api/library-hydrate returns market_values for the current grade signals.
  // Shape: { [collection_id]: { value, sample_size, fallback, bucket_used,
  //   newest_comp_date, oldest_comp_date } }
  const [marketValues, setMarketValues] = useState({});

  const [search, setSearch] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  // Duplicates panel — collapsed by default to stay out of the way; expands
  // on click so users who don't have dupes never see clutter.
  const [dupesOpen, setDupesOpen] = useState(false);
  // Wantlist export busy flag (separate from the full-collection csv export
  // so the two buttons can spin independently).
  const [wantlistExporting, setWantlistExporting] = useState(false);
  // Catalog-link state — Pro feature that upgrades local-only `comics` rows
  // to canonical `gcd_issue_id` rows. Audit is on-demand (button click), not
  // automatic, because the matcher does several round-trips and we don't
  // want to fire it on every library page load.
  const [catalogAudit, setCatalogAudit] = useState(null); // {summary, entries} | null
  const [catalogAuditing, setCatalogAuditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogApplying, setCatalogApplying] = useState(false);
  const [catalogResult, setCatalogResult] = useState(null);
  // Picker modal state — holds the entry being resolved (one of the audit's
  // entries[] items). Null = modal closed.
  const [pickerEntry, setPickerEntry] = useState(null);

  function handleShare() {
    if (!profile?.username) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [sortBy, setSortBy] = useState("title-asc");
  const [viewMode, setViewMode] = useState("list");
  // Persist view choice in localStorage. Defaults to "list"; on mobile
  // we'd prefer "rows" for density but don't force it (user can pick).
  // Deliberately NOT a lazy useState initializer — same server/client
  // hydration mismatch risk documented above for previewMode (window
  // doesn't exist during the server render pass), so this reads localStorage
  // in an effect after mount instead.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("library-view");
      if (stored === "list" || stored === "grid" || stored === "rows") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewMode(stored);
      }
    } catch {}
  }, []);
  const updateViewMode = (next) => {
    setViewMode(next);
    try { window.localStorage.setItem("library-view", next); } catch {}
  };
  // Pagination — the Workshop used to render every filtered item in one
  // shot regardless of collection size, which stopped being manageable once
  // a collection ran into the hundreds. list/grid paginate by item count;
  // rows paginate by series-group count instead (a group's issues shouldn't
  // split across pages just because the item count crossed a boundary).
  // One shared `page` cursor across all three view modes — each view mode's
  // render block computes its own page count from its own denominator, so
  // switching view modes doesn't need to reconcile different units, it just
  // clamps back to page 1 on the same effect that resets it for filters.
  const LIBRARY_PAGE_SIZE = 24;
  const LIBRARY_ROWS_PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  // Track expanded series in Rows view. Keyed by series-group key.
  const [expandedSeries, setExpandedSeries] = useState(() => new Set());
  const toggleSeriesExpanded = (key) =>
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [pdfExporting, setPdfExporting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  // Capture the upgrade flag once at mount. After router.replace() strips the
  // query param (in the effect below), this state still holds — so the banner
  // stays visible until the user dismisses it.
  const [upgradeBanner, setUpgradeBanner] = useState(() => {
    const flag = searchParams.get("upgrade");
    if (flag === "success" || flag === "cancelled") return flag;
    return null;
  });

  // Strip the ?upgrade=… query param after mount so refreshes don't keep
  // re-firing the banner. The initial banner value comes from the lazy
  // useState initializer above (it reads searchParams once at mount), so the
  // banner stays visible until the user dismisses it even after replace().
  useEffect(() => {
    const flag = searchParams.get("upgrade");
    if (flag === "success" || flag === "cancelled") {
      if (flag === "success") trackEvent("pro_upgrade");
      router.replace("/library", { scroll: false });
    }
  }, [searchParams, router]);

  async function handleExportPdf() {
    if (!user) return;
    if (!isPro) {
      window.location.href = "/upgrade";
      return;
    }
    setPdfExporting(true);
    try {
      const res = await authedFetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402 || err.upgrade) {
          window.location.href = "/upgrade";
          return;
        }
        alert(err.error || "PDF generation failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comixcatalog-collection-${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      trackEvent("pdf_export");
    } catch {
      alert("PDF export failed. Please try again.");
    } finally {
      setPdfExporting(false);
    }
  }

  async function handleCatalogAudit() {
    if (!user) return;
    if (!isPro) {
      window.location.href = "/upgrade";
      return;
    }
    setCatalogAuditing(true);
    setCatalogResult(null);
    try {
      const res = await authedFetch(
        "/api/library/catalog-link",
        { cache: "no-store" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402 || err.upgrade) {
          window.location.href = "/upgrade";
          return;
        }
        alert(err.error || "Audit failed");
        return;
      }
      const data = await res.json();
      setCatalogAudit(data);
      setCatalogOpen(true);
    } catch {
      alert("Audit failed. Please try again.");
    } finally {
      setCatalogAuditing(false);
    }
  }

  async function handleApplyConfidentLinks() {
    if (!user || !catalogAudit) return;
    const confident = catalogAudit.entries.filter((e) => e.status === "confident");
    if (confident.length === 0) return;
    const ok = window.confirm(
      `Link ${confident.length} book${confident.length === 1 ? "" : "s"} to our catalog? ` +
      `This unlocks story arc badges, run completion, and future automatic valuation for these books.`
    );
    if (!ok) return;
    setCatalogApplying(true);
    try {
      const res = await authedFetch("/api/library/catalog-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: confident.map((e) => ({
            collection_id: e.collection_id,
            gcd_issue_id: e.candidate.gcd_issue_id,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Link failed");
        return;
      }
      setCatalogResult(data);
      // Re-fetch the library so badges and counts re-evaluate against the
      // newly-linked rows. Without this the user has to refresh manually.
      await refreshLibrary?.();
      // Re-audit so confident list is now empty.
      await handleCatalogAudit();
    } catch {
      alert("Apply failed. Please try again.");
    } finally {
      setCatalogApplying(false);
    }
  }

  // Unlink action — removes a GCD-linked row from user_collections so the
  // user can re-add it via search if they want a different match. Soft "undo"
  // for a bad catalog-link choice. We don't try to convert it back to a
  // local `comics` row because (a) we'd be reconstructing data from GCD that
  // would just match the same way next time, (b) clean delete is the least
  // surprising behavior. Their `user_cover_url` photo is lost with the row,
  // which is the trade-off for keeping this simple.
  async function handleUnlinkRow(item) {
    if (!item?.id) return;
    const label = `${item.comic?.title ?? "this book"}${item.comic?.issueNumber ? ` #${item.comic.issueNumber}` : ""}`;
    const ok = window.confirm(
      `Unlink ${label} from the catalog?\n\n` +
      `This removes the row from your collection entirely. If you uploaded a photo of your copy, it'll be lost. ` +
      `You can re-add the book via search anytime.`
    );
    if (!ok) return;
    try {
      await removeFromCollection?.(item.libraryKey ?? item.id);
      // re-run the audit so the panel reflects the unlinked state
      if (catalogAudit) await handleCatalogAudit();
    } catch (err) {
      console.error("Unlink failed:", err);
      alert("Unlink failed. Please try again.");
    }
  }

  async function handleApplySingleLink(collection_id, gcd_issue_id) {
    if (!user) return;
    try {
      const res = await authedFetch("/api/library/catalog-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: [{ collection_id, gcd_issue_id }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Link failed");
        return;
      }
      if (data.linked > 0) {
        setCatalogResult({ linked: data.linked, skipped: data.skipped, errors: data.errors });
        await refreshLibrary?.();
        await handleCatalogAudit();
        setPickerEntry(null);
      } else if (data.errors?.[0]?.reason === "collision") {
        alert(
          "Couldn't link — you already have another row pointing at this catalog entry. " +
          "Remove one of them first if you didn't mean to track this book twice."
        );
      } else {
        alert(data.errors?.[0]?.message || "Link failed");
      }
    } catch {
      alert("Link failed. Please try again.");
    }
  }

  async function handleExportWantlist() {
    if (!user) return;
    if (!isPro) {
      window.location.href = "/upgrade";
      return;
    }
    setWantlistExporting(true);
    try {
      const res = await authedFetch("/api/export/wantlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402 || err.upgrade) {
          window.location.href = "/upgrade";
          return;
        }
        alert(err.error || "Wantlist export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comixcatalog-wantlist-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Wantlist export failed. Please try again.");
    } finally {
      setWantlistExporting(false);
    }
  }

  async function handleExportCsv() {
    if (!user) return;
    if (!isPro) {
      window.location.href = "/upgrade";
      return;
    }
    setCsvExporting(true);
    try {
      const res = await authedFetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402 || err.upgrade) {
          window.location.href = "/upgrade";
          return;
        }
        alert(err.error || "CSV export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comixcatalog-collection-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("CSV export failed. Please try again.");
    } finally {
      setCsvExporting(false);
    }
  }

  async function toggleForSale(item) {
    const newStatus = item.status === "for_sale" ? "owned" : "for_sale";
    const { error } = await supabase
      .from("user_collections")
      .update({ status: newStatus })
      .eq("id", item.id);

    if (error) {
      console.error("Sale toggle error:", error);
      return;
    }
    item.status = newStatus;
  }

  const librarySignature = useMemo(() => {
    const keys = [];
    for (const item of collections) {
      const key = makeLibraryKey(item);
      if (key) keys.push(key);
    }
    keys.sort();
    return keys.join("|");
  }, [collections]);

  useEffect(() => {
    let cancelled = false;

    async function loadLibraryItems() {
      const uniqueKeys = librarySignature ? librarySignature.split("|") : [];

      if (uniqueKeys.length === 0) {
        setComicIndex({});
        return;
      }

      // Merge cache into existing state instead of replacing it. Replacing on
      // every signature change blanks out items that were hydrated mid-session
      // but happened to roll out of `hydrationCache` (e.g. via a tab swap) —
      // which is what made fresh wishlist/collection adds appear missing on
      // the library page until a reload re-fetched them.
      const missingKeys = new Set();
      const cachedAdditions = {};
      for (const key of uniqueKeys) {
        const fresh = freshCacheEntry(key);
        if (fresh) {
          cachedAdditions[key] = fresh;
        } else {
          missingKeys.add(key);
        }
      }
      setComicIndex((prev) => ({ ...prev, ...cachedAdditions }));

      if (missingKeys.size === 0) return;

      const comicIds = [];
      const gcdIds = [];
      for (const key of missingKeys) {
        if (key.startsWith("gcd-")) {
          const n = Number(key.slice(4));
          if (!Number.isNaN(n)) gcdIds.push(n);
        } else {
          comicIds.push(key);
        }
      }

      // Build collection_grades payload — Phase 2 auto-valuation needs the
      // per-item grade signal to look up matching comps. Only items that have
      // a gcd_issue_id can be valued (no comps for local-only `comic_id`s).
      const collectionGrades = collections
        .filter((c) => c.gcd_issue_id != null)
        .map((c) => ({
          collection_id: c.id,
          gcd_issue_id: Number(c.gcd_issue_id),
          grade_numeric: c.grade_numeric ?? null,
          slab_company: c.slab_company ?? null,
          condition: c.condition ?? null,
        }));

      try {
        const res = await fetch("/api/library-hydrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comic_ids: comicIds,
            gcd_issue_ids: gcdIds,
            collection_grades: collectionGrades,
          }),
        });
        if (!res.ok || cancelled) return;

        const data = await res.json();
        const raw = data.items ?? {};

        const fresh = {};
        for (const [key, item] of Object.entries(raw)) {
          const normalized = {
            ...item,
            publisher: normalizePublisherName(item.publisher),
            rawPublisher: item.publisher ?? "Unknown Publisher",
            cover: item.cover || "/fallback-cover.png",
          };
          fresh[key] = normalized;
          hydrationCache.set(key, { data: normalized, cachedAt: Date.now() });
        }

        if (!cancelled) {
          setComicIndex((prev) => ({ ...prev, ...fresh }));
          if (data.market_values && typeof data.market_values === "object") {
            setMarketValues((prev) => ({ ...prev, ...data.market_values }));
          }
        }
      } catch (err) {
        console.error("Failed to load library items", err);
      }
    }

    loadLibraryItems();
    return () => {
      cancelled = true;
    };
  }, [librarySignature]);

  // All-status hydrated view of the collection — used by the unified stats
  // strip and insight sidebar, which need owned/wantlist/for_sale counts
  // simultaneously. Separate from libraryItems (tab-filtered) which the grid
  // consumes.
  const allHydrated = useMemo(() => {
    return collections.map((item) => {
      const key = makeLibraryKey(item);
      const comic = key ? comicIndex[key] : null;
      return {
        ...item,
        comic: comic
          ? { title: comic.title, publisher: comic.publisher, year: comic.year }
          : null,
      };
    });
  }, [collections, comicIndex]);

  const libraryItems = useMemo(() => {
    return collections
      .filter((item) => item.status === tab)
      .map((item) => {
        const key = makeLibraryKey(item);
        if (!key) return null;
        const comic = comicIndex[key];
        // Even without hydration data we surface the row as a stub. Previous
        // behavior (return null) hid freshly-added wishlist/collection items
        // until /api/library-hydrate completed, which made first-attempt adds
        // appear to silently fail. Stub now, real data fills in on next
        // render once hydration resolves.
        const stub = {
          id: key,
          title: "…",
          issueNumber: "",
          year: null,
          publisher: "Unknown Publisher",
          rawPublisher: "Unknown Publisher",
          cover: "/fallback-cover.png",
        };
        const resolved = comic ?? stub;
        return {
          ...item,
          libraryKey: key,
          hydrated: Boolean(comic),
          comic: { ...resolved, href: getLibraryHref(item, comic) },
        };
      })
      .filter(Boolean);
  }, [collections, tab, comicIndex]);

  const availablePublishers = useMemo(() => {
    const counts = {};
    for (const item of libraryItems) {
      const publisher = normalizePublisherName(item.comic?.publisher);
      counts[publisher] = (counts[publisher] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [libraryItems]);

  // Era-focus / top-publishers / slab-ratio used to be computed here.
  // CollectionInsightSidebar now owns that math — same logic, single source.

  const filteredItems = useMemo(() => {
    let result = [...libraryItems];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((item) => {
        const title = String(item.comic.title || "").toLowerCase();
        const issue = String(item.comic.issueNumber || "").toLowerCase();
        const publisher = String(item.comic.publisher || "").toLowerCase();
        const year = String(item.comic.year || "").toLowerCase();
        return title.includes(q) || issue.includes(q) || publisher.includes(q) || year.includes(q);
      });
    }

    if (publisherFilter !== "all") {
      result = result.filter(
        (item) => normalizePublisherName(item.comic?.publisher) === publisherFilter
      );
    }

    result.sort((a, b) => {
      const titleA = String(a.comic.title || "").toLowerCase();
      const titleB = String(b.comic.title || "").toLowerCase();
      const yearA = Number(a.comic.year || 0);
      const yearB = Number(b.comic.year || 0);
      const issueA = String(a.comic.issueNumber || "");
      const issueB = String(b.comic.issueNumber || "");

      switch (sortBy) {
        case "title-asc":   return titleA.localeCompare(titleB);
        case "title-desc":  return titleB.localeCompare(titleA);
        case "year-desc":   return yearB - yearA;
        case "year-asc":    return yearA - yearB;
        case "issue-asc":   return issueA.localeCompare(issueB, undefined, { numeric: true });
        case "issue-desc":  return issueB.localeCompare(issueA, undefined, { numeric: true });
        default:            return 0;
      }
    });

    return result;
  }, [libraryItems, search, publisherFilter, sortBy]);

  // Land back on page 1 whenever the underlying result set or its shape
  // changes — otherwise switching tabs (or typing a new search) can strand
  // you on a page number that no longer exists for the new filtered set.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
  }, [tab, search, publisherFilter, sortBy, viewMode]);

  const isHydrating = useMemo(() => {
    if (collections.length === 0) return false;
    return collections.some((item) => {
      const key = makeLibraryKey(item);
      return key && !comicIndex[key];
    });
  }, [collections, comicIndex]);

  const stats = useMemo(() => {
    const rawCurrent = collections.filter((item) => item.status === tab);
    const hydratedCurrent = rawCurrent
      .map((item) => ({ ...item, comic: comicIndex[makeLibraryKey(item)] || null }))
      .filter((item) => item.comic);

    const ownedCount = collections.filter((c) => c.status === "owned").length;
    const wishlistCount = collections.filter((c) => c.status === "wishlist").length;
    const forSaleCount = collections.filter((c) => c.status === "for_sale").length;

    const uniqueSeries = new Set(
      hydratedCurrent.map(
        (item) => `${item.comic?.title || "Untitled"}::${normalizePublisherName(item.comic?.publisher)}`
      )
    ).size;

    const uniquePublishers = new Set(
      hydratedCurrent.map((item) => normalizePublisherName(item.comic?.publisher))
    ).size;

    const withYear = hydratedCurrent.filter((item) => item.comic.year);
    const newestYear = withYear.length
      ? Math.max(...withYear.map((item) => Number(item.comic.year)))
      : "—";

    // Phase 1 unify: bring Slabbed + Collection Value stats from the public
    // profile onto /library so the owner's management view matches what
    // visitors see. Slabbed = count of owned rows with a slab_company set.
    // Collection Value = sum of (market_value OR auto_market_value) across
    // owned rows. We exclude wantlist/for_sale from value because the user
    // hasn't bought those yet (or is reselling at potentially different prices).
    const ownedItems = collections.filter((c) => c.status === "owned");
    const slabbedCount = ownedItems.filter((c) => c.slab_company).length;
    const slabRatio = ownedItems.length > 0
      ? Math.round((slabbedCount / ownedItems.length) * 100)
      : 0;

    let collectionValue = 0;
    for (const item of ownedItems) {
      const userValue = Number(item.market_value);
      if (!Number.isNaN(userValue) && userValue > 0) {
        collectionValue += userValue;
        continue;
      }
      // auto_market_value comes via marketValues[item.id] (already keyed by
      // collection.id from /api/library-hydrate). Fall through to that.
      const auto = marketValues?.[item.id]?.value;
      if (auto != null && !Number.isNaN(Number(auto))) {
        collectionValue += Number(auto);
      }
    }

    return {
      totalInView: rawCurrent.length,
      renderedInView: hydratedCurrent.length,
      ownedCount,
      wishlistCount,
      forSaleCount,
      uniqueSeries,
      uniquePublishers,
      newestYear,
      slabbedCount,
      slabRatio,
      collectionValue,
    };
  }, [collections, comicIndex, tab, marketValues]);

  // Hybrid-duplicate detection.
  //
  // Same-key duplicates (two rows for the same comic_id or two rows for the
  // same gcd_issue_id) are impossible — both the in-app add path and CSV
  // import explicitly upsert/lookup-then-insert. What CAN slip through is
  // a *hybrid* duplicate: the same logical issue stored once as a local
  // `comics` row (typed in or CSV-imported before we had the GCD match) and
  // again as a `gcd_issue_id` row (added later via search after ingestion).
  // Two different library keys, same physical book.
  //
  // We group owned rows by normalized (title, issue_number) — sourced from
  // the hydrated `comic` object, since the raw library row doesn't carry
  // human-readable metadata. Rows whose comic hasn't hydrated yet are skipped
  // (they'll re-evaluate once hydration lands). A group counts as a dupe only
  // when at least one local AND one gcd row coexist — pure same-source pairs
  // would mean our dedup broke, which we want to know about separately and
  // is not what this panel is for.
  const duplicates = useMemo(() => {
    function normTitle(s) {
      return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
    }
    function normIssue(s) {
      return String(s || "").trim().toLowerCase();
    }
    const groups = new Map();
    for (const item of collections) {
      if (item.status !== "owned") continue;
      const key = makeLibraryKey(item);
      if (!key) continue;
      const comic = comicIndex[key];
      if (!comic) continue; // skip until hydrated
      const t = normTitle(comic.title);
      const n = normIssue(comic.issue_number);
      if (!t || !n) continue;
      const gkey = `${t}::${n}`;
      if (!groups.has(gkey)) groups.set(gkey, []);
      groups.get(gkey).push({ item, comic, libraryKey: key });
    }
    const dupeGroups = [];
    for (const [gkey, rows] of groups.entries()) {
      if (rows.length < 2) continue;
      const localCount = rows.filter((r) => r.item.gcd_issue_id == null).length;
      const gcdCount = rows.filter((r) => r.item.gcd_issue_id != null).length;
      // Only surface true hybrids — mixed sources. Two pure-local or two
      // pure-gcd rows would indicate a dedup bug; we don't pitch those as
      // "library health" because the cleanup path is different.
      if (localCount === 0 || gcdCount === 0) continue;
      const sample = rows[0];
      dupeGroups.push({
        key: gkey,
        count: rows.length,
        rows,
        title: sample.comic.title,
        issue: sample.comic.issue_number,
        localCount,
        gcdCount,
      });
    }
    dupeGroups.sort((a, b) => b.count - a.count);
    return dupeGroups;
  }, [collections, comicIndex]);

  const dupeTotal = duplicates.reduce((sum, g) => sum + (g.count - 1), 0);

  return (
    <main className="library-shell">
      {upgradeBanner === "success" && (
        <div className="library-upgrade-banner success" role="status">
          <span className="library-upgrade-banner-icon" aria-hidden="true">✓</span>
          <div className="library-upgrade-banner-body">
            <strong>Welcome to Pro.</strong> The Export PDF button below is now unlocked.
          </div>
          <button
            type="button"
            className="library-upgrade-banner-close"
            onClick={() => setUpgradeBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {upgradeBanner === "cancelled" && (
        <div className="library-upgrade-banner cancelled" role="status">
          <div className="library-upgrade-banner-body">
            Checkout cancelled — no charge. <Link href="/upgrade">Try again</Link> when you&rsquo;re ready.
          </div>
          <button
            type="button"
            className="library-upgrade-banner-close"
            onClick={() => setUpgradeBanner(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {loadError && (
        <div className="library-upgrade-banner cancelled" role="alert">
          <div className="library-upgrade-banner-body">
            Couldn&rsquo;t load your library: {loadError}.{" "}
            <button
              type="button"
              className="auth-link-button"
              onClick={() => refreshLibrary?.()}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {/* View-mode toggle — owner round-trips between Manage and Public
          preview. Public preview = exactly what visitors see at /u/<name>,
          but rendered on the same data without losing scroll position. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <div
          role="tablist"
          aria-label="View mode"
          style={{
            display: "inline-flex",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            padding: 3,
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={previewMode === "manage"}
            onClick={() => setPreviewMode("manage")}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: previewMode === "manage" ? "var(--cc-gold, #FFD700)" : "transparent",
              color: previewMode === "manage" ? "#0d1733" : "rgba(255,255,255,0.7)",
              fontWeight: 700,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Manage
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={previewMode === "public"}
            onClick={() => setPreviewMode("public")}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: previewMode === "public" ? "var(--cc-gold, #FFD700)" : "transparent",
              color: previewMode === "public" ? "#0d1733" : "rgba(255,255,255,0.7)",
              fontWeight: 700,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
            title="See your collection the way visitors do"
          >
            Public preview
          </button>
        </div>
      </div>

      {isPublicPreview && (
        <div
          style={{
            marginBottom: 14,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(33,150,243,0.08)",
            border: "1px solid rgba(33,150,243,0.25)",
            fontSize: "0.85rem",
            opacity: 0.9,
          }}
        >
          👁 You&rsquo;re in <strong>Public preview</strong>. This is how visitors see your
          collection at <code>/u/{profile?.username}</code> — management controls are hidden,
          stats respect your privacy toggles. Click <strong>Manage</strong> above to edit.
        </div>
      )}

      <section className="library-page-header">
        <div>
          <div className="library-kicker">
            {isPublicPreview ? "Public Showcase" : "Collection Management"}
          </div>
          <h1 className="library-title">
            {isPublicPreview && profile?.display_name ? profile.display_name : "My Library"}
          </h1>
          <p className="library-subtitle">
            {isPublicPreview
              ? "What other collectors and visitors see when they visit your profile."
              : "Manage your collection, wantlist, and CSV imports from one place."}
          </p>
          {profile?.username && !isPublicPreview && (
            <button
              type="button"
              className={`library-share-btn ${shareCopied ? "library-share-btn--copied" : ""}`}
              onClick={handleShare}
            >
              {shareCopied ? "✓ Link copied!" : "↗ Share my collection"}
            </button>
          )}
        </div>
        <div className="library-header-actions">
          {user && !isPublicPreview && (
            <>
              <button
                className="library-secondary-btn"
                onClick={handleExportPdf}
                disabled={pdfExporting}
                type="button"
                title={isPro ? "Export your collection as an insurance PDF" : "Pro feature — click to upgrade"}
              >
                {pdfExporting
                  ? "Generating…"
                  : isPro
                    ? "Export PDF"
                    : "Export PDF (Pro)"}
              </button>
              <button
                className="library-secondary-btn"
                onClick={handleExportCsv}
                disabled={csvExporting}
                type="button"
                title={isPro ? "Export your collection as a CSV (Discogs-style)" : "Pro feature — click to upgrade"}
              >
                {csvExporting
                  ? "Exporting…"
                  : isPro
                    ? "Export CSV"
                    : "Export CSV (Pro)"}
              </button>
              {tab === "wishlist" && stats.wishlistCount > 0 && (
                <button
                  className="library-secondary-btn"
                  onClick={handleExportWantlist}
                  disabled={wantlistExporting}
                  type="button"
                  title={isPro ? "Printable shopping list for cons & shops" : "Pro feature — click to upgrade"}
                >
                  {wantlistExporting
                    ? "Exporting…"
                    : isPro
                      ? "Export Wantlist"
                      : "Export Wantlist (Pro)"}
                </button>
              )}
              <Link
                href="/library/add"
                className="library-primary-btn"
                title="For a book not already in our catalog — search above first if you're not sure."
              >
                + Add manually
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="library-topbar">
        <div className="library-tabs">
          <button
            className={`library-tab ${tab === "owned" ? "active" : ""}`}
            onClick={() => setTab("owned")}
          >
            Collection {stats.ownedCount > 0 && <span className="library-tab-count">{stats.ownedCount}</span>}
          </button>
          <button
            className={`library-tab ${tab === "wishlist" ? "active" : ""}`}
            onClick={() => setTab("wishlist")}
          >
            Wantlist {stats.wishlistCount > 0 && <span className="library-tab-count">{stats.wishlistCount}</span>}
          </button>
        </div>

        {!isPublicPreview && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = e.target.file.files[0];
            if (!file || !user) return;
            if (!file.name.endsWith(".csv")) {
              setCsvResult({ created: 0, reused: 0, skipped: 0, errors: [{ row: "-", message: "Invalid file type" }] });
              return;
            }
            const fd = new FormData();
            fd.append("file", file);
            const res = await authedFetch("/api/csv-import", { method: "POST", body: fd });
            // Pro-gated row cap. 402 = exceeded the free cap; surface the
            // server's explanation in the import-summary panel AND offer a
            // direct route to /upgrade so users can act on it.
            if (res.status === 402) {
              const json = await res.json().catch(() => ({}));
              const proceed = window.confirm(
                `${json.error || "Collector Pro is required to import this many rows."}\n\nSee membership options now?`
              );
              if (proceed) window.location.href = "/upgrade";
              setCsvResult({
                created: 0,
                reused: 0,
                skipped: json.attempted ?? 0,
                errors: [{ row: "-", message: json.error || "Collector Pro allows larger imports" }],
              });
              return;
            }
            const json = await res.json();
            setCsvResult(json.results || null);
          }}
          className="library-upload-bar"
        >
          <label className={`library-secondary-btn ${selectedFile ? "ready" : ""}`}>
            {selectedFile ? "CSV Ready ✓" : "Choose CSV"}
            <input
              type="file"
              name="file"
              accept=".csv"
              hidden
              onChange={(e) => setSelectedFile(e.target.files[0] || null)}
            />
          </label>
          <button
            type="submit"
            className="library-secondary-btn"
            title={isPro ? "Pro: up to 200 rows per import" : "Free: up to 25 rows. Collector Pro allows up to 200."}
          >
            Upload CSV
          </button>
        </form>
        )}
      </section>

      {/* Unified stats strip (Phase 2 of library/profile unify). Same
          component used on /u/[username] so the two surfaces never drift
          on stat shape, label wording, or computation. Owner sees
          everything (no privacy clamping); the public profile applies
          profile.show_wantlist / show_for_sale / show_value. */}
      <CollectionStatsStrip
        collection={allHydrated}
        autoMarketValues={marketValues}
        visibility={
          isPublicPreview
            ? {
                wantlist: profile?.show_wantlist !== false,
                for_sale: profile?.show_for_sale !== false,
                value: profile?.show_value !== false,
              }
            : {}
        }
      />

      {/* ── Catalog linking (Pro) ─────────────────────────────────────────
          Local-only books (added by CSV import or the manual /library/add
          form before a GCD match existed) are invisible to arc completion,
          run tracking, and future automatic valuation. This panel scans
          for matches in our catalog and offers a one-click upgrade.
          Hidden in public preview — it's a management action. */}
      {!isPublicPreview && (
      <section
        style={{
          margin: "0 0 18px",
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(76,175,80,0.05)",
          border: "1px solid rgba(76,175,80,0.20)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong style={{ color: "#4CAF50" }}>🔗 Catalog linking:</strong>{" "}
            <span style={{ opacity: 0.85 }}>
              {catalogAudit
                ? `${catalogAudit.summary.confident} confident match${catalogAudit.summary.confident === 1 ? "" : "es"}, ${catalogAudit.summary.ambiguous} need manual review, ${catalogAudit.summary.no_match} not in catalog yet.`
                : "Find books in your collection that aren't yet linked to our catalog. Linking unlocks story arc badges, run completion, and future valuation."}
            </span>
          </div>
          {isPro ? (
            <button
              type="button"
              className="library-secondary-btn"
              onClick={handleCatalogAudit}
              disabled={catalogAuditing || catalogApplying}
              style={{ flexShrink: 0 }}
            >
              {catalogAuditing ? "Scanning…" : catalogAudit ? "Re-scan" : "Scan my library"}
            </button>
          ) : (
            <Link
              href="/upgrade"
              className="library-secondary-btn"
              style={{ flexShrink: 0, textDecoration: "none" }}
            >
              Available with Pro →
            </Link>
          )}
        </div>

        {isPro && catalogAudit && (catalogAudit.summary.confident > 0 || catalogAudit.summary.ambiguous > 0) && (
          <div style={{ marginTop: 12 }}>
            {catalogAudit.summary.confident > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "rgba(76,175,80,0.10)",
                  border: "1px solid rgba(76,175,80,0.30)",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: "0.9rem" }}>
                  <strong>{catalogAudit.summary.confident} confident match{catalogAudit.summary.confident === 1 ? "" : "es"}</strong>
                  {" "}can be linked in one click.
                </div>
                <button
                  type="button"
                  onClick={handleApplyConfidentLinks}
                  disabled={catalogApplying}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(76,175,80,0.4)",
                    background: "linear-gradient(90deg, #4CAF50, #2196F3)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: catalogApplying ? "not-allowed" : "pointer",
                    opacity: catalogApplying ? 0.7 : 1,
                    flexShrink: 0,
                  }}
                >
                  {catalogApplying ? "Linking…" : `Link all ${catalogAudit.summary.confident}`}
                </button>
              </div>
            )}

            {catalogResult && (
              <div
                style={{
                  fontSize: "0.85rem",
                  opacity: 0.85,
                  marginBottom: 10,
                }}
              >
                ✓ Linked {catalogResult.linked} book{catalogResult.linked === 1 ? "" : "s"} to the catalog.
                {catalogResult.skipped > 0 && ` (${catalogResult.skipped} skipped.)`}
              </div>
            )}

            <button
              type="button"
              className="library-secondary-btn"
              onClick={() => setCatalogOpen((v) => !v)}
              style={{ marginBottom: 4 }}
            >
              {catalogOpen ? "Hide details" : "Show details"}
            </button>

            {catalogOpen && (
              <div style={{ marginTop: 12 }}>
                {catalogAudit.summary.confident > 0 && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", opacity: 0.7, marginBottom: 6 }}>
                      Confident matches
                    </div>
                    <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none" }}>
                      {catalogAudit.entries
                        .filter((e) => e.status === "confident")
                        .map((e) => (
                          <li
                            key={e.collection_id}
                            style={{
                              padding: "6px 0",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              fontSize: "0.85rem",
                            }}
                          >
                            <div>
                              {e.comic?.series_title} #{e.comic?.issue_number}
                              {e.comic?.release_year ? ` (${e.comic.release_year})` : ""}
                            </div>
                            <div style={{ opacity: 0.65, fontSize: "0.8rem" }}>
                              → {e.candidate?.series_title} #{e.candidate?.issue_number}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </>
                )}

                {catalogAudit.summary.ambiguous > 0 && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", opacity: 0.7, marginBottom: 6 }}>
                      Ambiguous — multiple catalog candidates
                    </div>
                    <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none" }}>
                      {catalogAudit.entries
                        .filter((e) => e.status === "ambiguous")
                        .map((e) => (
                          <li
                            key={e.collection_id}
                            style={{
                              padding: "8px 0",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                              fontSize: "0.85rem",
                            }}
                          >
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>
                                {e.comic?.series_title} #{e.comic?.issue_number}
                                {e.comic?.release_year ? ` (${e.comic.release_year})` : ""}
                              </div>
                              <div style={{ opacity: 0.6, fontSize: "0.8rem" }}>
                                {e.candidates?.length} possible match{e.candidates?.length === 1 ? "" : "es"}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="library-secondary-btn"
                              onClick={() => setPickerEntry(e)}
                              style={{ flexShrink: 0 }}
                            >
                              Choose match…
                            </button>
                          </li>
                        ))}
                    </ul>
                  </>
                )}

                {catalogAudit.summary.no_match > 0 && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: "0.85rem", opacity: 0.7, marginBottom: 6 }}>
                      Not auto-matched — search the catalog manually
                    </div>
                    <ul style={{ margin: "0 0 6px", padding: 0, listStyle: "none" }}>
                      {catalogAudit.entries
                        .filter((e) => e.status === "no_match" && e.comic)
                        .map((e) => (
                          <li
                            key={e.collection_id}
                            style={{
                              padding: "8px 0",
                              borderTop: "1px solid rgba(255,255,255,0.06)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 12,
                              flexWrap: "wrap",
                              fontSize: "0.85rem",
                            }}
                          >
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div style={{ fontWeight: 600 }}>
                                {e.comic?.series_title} #{e.comic?.issue_number}
                                {e.comic?.release_year ? ` (${e.comic.release_year})` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="library-secondary-btn"
                              onClick={() => setPickerEntry(e)}
                              style={{ flexShrink: 0 }}
                            >
                              Search…
                            </button>
                          </li>
                        ))}
                    </ul>
                    <div style={{ fontSize: "0.75rem", opacity: 0.55, marginTop: 6 }}>
                      Books that aren&rsquo;t in our catalog yet stay as local entries — they still appear in your collection, they just don&rsquo;t link to canonical art or arc badges until ingested.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {isPro && catalogAudit && catalogAudit.summary.total === 0 && (
          <div style={{ marginTop: 8, fontSize: "0.85rem", opacity: 0.7 }}>
            ✓ All your owned books are already linked to the catalog. Nothing to do here.
          </div>
        )}
      </section>
      )}

      {/* ── Library health: hybrid duplicates ─────────────────────────────
          Surfaces when an issue is tracked once locally and once via GCD —
          a real data-hygiene problem caused by adding a book before our
          catalog had a match, then again after. Same-key dupes are blocked
          by the write path, so this is the only meaningful dupe class.
          Hidden in public preview — also a management action. */}
      {!isPublicPreview && duplicates.length > 0 && (
        <section
          style={{
            margin: "0 0 18px",
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(255,193,7,0.06)",
            border: "1px solid rgba(255,193,7,0.25)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong style={{ color: "var(--cc-gold, #FFD700)" }}>
                ⚠ Library health:
              </strong>{" "}
              <span style={{ opacity: 0.85 }}>
                {duplicates.length} issue{duplicates.length === 1 ? "" : "s"}{" "}
                {duplicates.length === 1 ? "is" : "are"} tracked twice
                {" "}— once as a local entry and once linked to our catalog.
                {" "}Merging removes {dupeTotal} extra row{dupeTotal === 1 ? "" : "s"}.
              </span>
            </div>
            {isPro ? (
              <button
                type="button"
                className="library-secondary-btn"
                onClick={() => setDupesOpen((v) => !v)}
                style={{ flexShrink: 0 }}
              >
                {dupesOpen ? "Hide details" : "Review"}
              </button>
            ) : (
              <Link
                href="/upgrade"
                className="library-secondary-btn"
                style={{ flexShrink: 0, textDecoration: "none" }}
              >
                Review with Pro →
              </Link>
            )}
          </div>
          {isPro && dupesOpen && (
            <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
              {duplicates.map((g) => {
                // Prefer the GCD row as the "canonical" link target — it
                // carries cover art and our catalog metadata. Falls back to
                // any row's library key if GCD link is unavailable.
                const gcdRow = g.rows.find((r) => r.item.gcd_issue_id != null);
                const href = gcdRow
                  ? `/issue/gcd-${gcdRow.item.gcd_issue_id}`
                  : `/comic/${g.rows[0].item.comic_id}`;
                return (
                  <li
                    key={g.key}
                    style={{
                      padding: "8px 0",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: "0.9rem",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <Link
                        href={href}
                        style={{ color: "var(--cc-gold, #FFD700)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {g.title} #{g.issue}
                      </Link>
                    </div>
                    <div style={{ opacity: 0.7, fontSize: "0.8rem", textAlign: "right" }}>
                      {g.localCount} local + {g.gcdCount} catalog
                    </div>
                  </li>
                );
              })}
              <li style={{ paddingTop: 10, opacity: 0.6, fontSize: "0.8rem" }}>
                Auto-merge is coming. For now, open each issue and remove the older
                local entry — your catalog-linked row keeps the cover art and metadata.
              </li>
            </ul>
          )}
        </section>
      )}

      {csvResult && (
        <section className="library-import-summary">
          <div className="library-import-title">Import Summary</div>
          <div className="library-import-grid">
            <div>Created: {csvResult.created}</div>
            <div>Reused: {csvResult.reused}</div>
            <div>Skipped: {csvResult.skipped}</div>
          </div>
          {csvResult.errors?.length > 0 && (
            <div className="library-import-errors">
              <strong>Errors ({csvResult.errors.length})</strong>
              <ul>
                {csvResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>Row {err.row}: {err.message}</li>
                ))}
              </ul>
              {csvResult.errors.length > 5 && (
                <div className="library-import-note">Showing first 5 errors…</div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="library-layout">
        <aside className="library-sidebar">
          <div className="library-sidebar-section">
            <div className="library-sidebar-title">Search Library</div>
            <input
              className="library-search-input"
              placeholder={`Search ${tab === "owned" ? "collection" : "wantlist"}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="library-sidebar-section">
            <div className="library-sidebar-title">Publisher</div>
            <select
              className="library-select"
              value={publisherFilter}
              onChange={(e) => setPublisherFilter(e.target.value)}
            >
              <option value="all">All Publishers</option>
              {availablePublishers.map((pub) => (
                <option key={pub.name} value={pub.name}>{pub.name} ({pub.count})</option>
              ))}
            </select>
          </div>

          <div className="library-sidebar-section">
            <div className="library-sidebar-title">Quick Filters</div>
            <button
              className={`library-filter-chip ${publisherFilter === "all" ? "active" : ""}`}
              onClick={() => setPublisherFilter("all")}
              type="button"
            >
              All Publishers
            </button>
            {availablePublishers.slice(0, 8).map((pub) => (
              <button
                key={pub.name}
                className={`library-filter-chip ${publisherFilter === pub.name ? "active" : ""}`}
                onClick={() => setPublisherFilter(pub.name)}
                type="button"
              >
                {pub.name}
              </button>
            ))}
          </div>

          {/* /library is always the signed-in owner's own page. */}
          <RunCompletionWidget />

          {/* Unified insight widgets (Phase 2). Same component used on the
              public profile; owner sees Cost basis (shown=true), public
              viewers don't. */}
          <CollectionInsightSidebar
            collection={allHydrated}
            showCostBasis={true}
          />
        </aside>

        <section className="library-results-panel">
          <div className="library-results-header">
            <div className="library-results-copy">
              <h2>{tab === "owned" ? "Collection" : "Wantlist"}</h2>
              <p>{filteredItems.length} item{filteredItems.length === 1 ? "" : "s"}</p>
            </div>
            <div className="library-results-controls">
              <select
                className="library-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="title-asc">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
                <option value="year-desc">Year Newest</option>
                <option value="year-asc">Year Oldest</option>
                <option value="issue-asc">Issue Low–High</option>
                <option value="issue-desc">Issue High–Low</option>
              </select>
              <div className="library-view-toggle">
                <button
                  type="button"
                  className={`library-view-btn ${viewMode === "rows" ? "active" : ""}`}
                  onClick={() => updateViewMode("rows")}
                >
                  Rows
                </button>
                <button
                  type="button"
                  className={`library-view-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => updateViewMode("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={`library-view-btn ${viewMode === "grid" ? "active" : ""}`}
                  onClick={() => updateViewMode("grid")}
                >
                  Grid
                </button>
              </div>
            </div>
          </div>

          {loading && <div className="library-empty-state">Loading…</div>}

          {!loading && filteredItems.length === 0 && isHydrating && (
            <div className={viewMode === "grid" ? "comic-grid" : "library-list"}>
              {Array.from({ length: Math.min(stats.totalInView || 6, 12) }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className={viewMode === "grid" ? "comic-card library-skeleton-card" : "library-list-row library-skeleton-row"}
                  aria-hidden="true"
                />
              ))}
            </div>
          )}

          {!loading && filteredItems.length === 0 && !isHydrating && (
            (() => {
              // Different empty states depending on whether the user has *any*
              // items in this tab (true empty) or just no items matching the
              // current search/filter (filtered empty).
              const totalInTab = collections.filter((c) => c.status === tab).length;
              // First-run activation: if the user has zero items in their
              // *entire* collection (not just this tab), show the search-led
              // FirstRunLibrary screen instead of the generic empty state.
              // The Wantlist tab still gets its own message because a
              // wantlist-empty-but-owned-nonempty user is a different mental
              // state from "I just signed up".
              const totalInAnyTab = collections.length;
              if (totalInTab === 0) {
                if (tab === "owned" && totalInAnyTab === 0) {
                  return <FirstRunLibrary />;
                }
                return tab === "owned" ? (
                  <EmptyState
                    icon="📚"
                    title="No comics in your collection yet"
                    body="Search the database for any series or issue, then add it to your collection to start tracking grades, values, and variants."
                    ctaHref="/search"
                    ctaLabel="Browse the database"
                    secondary={{ href: "/library/add", label: "Add a comic manually" }}
                  />
                ) : (
                  <EmptyState
                    icon="🎯"
                    title="Your wantlist is empty"
                    body="Add issues you're hunting for. We'll surface them when sellers list matching copies, and your wantlist becomes a public link you can share."
                    ctaHref="/search"
                    ctaLabel="Find issues to track"
                  />
                );
              }
              // Filtered empty (search / publisher filter active)
              return (
                <EmptyState
                  icon="🔍"
                  title="No matches"
                  body={`Nothing in your ${tab === "owned" ? "collection" : "wishlist"} matches the current search or filter.`}
                />
              );
            })()
          )}

          {/* ── LIST VIEW ── */}
          {!loading && filteredItems.length > 0 && viewMode === "list" && (
            <div className="library-list">
              {filteredItems.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE).map((item) => {
                const comic = item.comic;

                // Merge live grade state with DB values
                const liveGrade = gradeData[item.id] ?? {
                  grade_numeric: item.grade_numeric ?? null,
                  condition: item.condition ?? null,
                  slab_company: item.slab_company ?? null,
                  slab_cert_number: item.slab_cert_number ?? null,
                  notes: item.notes ?? null,
                  purchase_price: item.purchase_price ?? null,
                  market_value: item.market_value ?? null,
                  user_cover_url: USER_COVER_UPLOAD_ENABLED ? (item.user_cover_url ?? null) : null,
                };

                const displayCover =
                  resolveUserCover(liveGrade.user_cover_url) ||
                  comic.cover ||
                  "/fallback-cover.png";

                return (
                  <article
                    key={`${item.id}-${item.libraryKey}-${item.status}`}
                    className="library-list-row"
                  >
                    <Link href={getLibraryHref(item, comic)} className="library-list-cover">
                      <img
                        src={displayCover}
                        alt={comic.title}
                        loading="lazy"
                      />
                      {USER_COVER_UPLOAD_ENABLED && liveGrade.user_cover_url && (
                        <span className="library-cover-tag" title="Your photo">Your photo</span>
                      )}
                    </Link>

                    <div className="library-list-main">
                      <Link href={getLibraryHref(item, comic)} className="library-list-title">
                        {comic.title}
                        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                        {item.variant_label ? (
                          <span style={{ opacity: 0.7, fontWeight: 500 }}> ({item.variant_label})</span>
                        ) : null}
                        {item.copy_number > 1 ? (
                          <span style={{ opacity: 0.55, fontWeight: 500, fontSize: "0.85em" }}> · Copy {item.copy_number}</span>
                        ) : null}
                      </Link>

                      <div className="library-list-meta">
                        <span>{comic.publisher || "Unknown Publisher"}</span>
                        <span>•</span>
                        <span>{comic.year || "Unknown Year"}</span>
                        <span>•</span>
                        <span>{tab === "owned" ? "In Collection" : "On Wantlist"}</span>
                        {liveGrade.slab_company && (
                          <>
                            <span>•</span>
                            <span style={{ color: "var(--cc-gold)", fontWeight: 700 }}>
                              {liveGrade.slab_company}
                            </span>
                          </>
                        )}
                        {liveGrade.purchase_price != null && (
                          <>
                            <span>•</span>
                            <span title="What you paid">
                              Paid ${Number(liveGrade.purchase_price).toFixed(2)}
                            </span>
                          </>
                        )}
                        {liveGrade.market_value != null && (
                          <>
                            <span>•</span>
                            <span style={{ color: "var(--cc-gold)" }} title="Market value (your estimate)">
                              Worth ${Number(liveGrade.market_value).toFixed(2)}
                            </span>
                          </>
                        )}
                        {/* Auto-value — only when no user override exists.
                            Two sources, distinguished by source field:
                              market-comp → median of recent eBay sold-comps
                              cover-price → era-based floor estimate (no comps yet) */}
                        {liveGrade.market_value == null &&
                          marketValues[item.id]?.value != null && (() => {
                            const mv = marketValues[item.id];
                            const isComp = mv.source === "market-comp";
                            // Browse API gives active asking prices, not sold.
                            // Disclose that honestly so collectors don't treat
                            // "median asking" as "actual market value."
                            const isListed = isComp && mv.comp_source === "ebay-listed";
                            const isSold   = isComp && mv.comp_source === "ebay";
                            let tooltip, label;
                            if (isSold) {
                              tooltip = `Median of ${mv.sample_size} recent sold listing${mv.sample_size === 1 ? "" : "s"} in bucket ${mv.bucket_used}${mv.fallback ? " (fallback bucket)" : ""}`;
                              label = `auto, ${mv.sample_size} ${mv.sample_size === 1 ? "sale" : "sales"}`;
                            } else if (isListed) {
                              tooltip = `Median of ${mv.sample_size} active eBay listing${mv.sample_size === 1 ? "" : "s"} in bucket ${mv.bucket_used}. Asking prices, not sold — typically skew high. Sold-comp data unlocks when our Marketplace Insights access lands.`;
                              label = `asking, ${mv.sample_size} ${mv.sample_size === 1 ? "listing" : "listings"}`;
                            } else if (isComp) {
                              tooltip = `Median of ${mv.sample_size} comp${mv.sample_size === 1 ? "" : "s"} in bucket ${mv.bucket_used}`;
                              label = `auto, ${mv.sample_size}`;
                            } else {
                              tooltip = "No recent sales data yet — showing era-based cover-price floor. Real comps will replace this once eBay data is fetched.";
                              label = "cover price";
                            }
                            return (
                              <>
                                <span>•</span>
                                <span style={{ color: "var(--cc-gold)" }} title={tooltip}>
                                  Worth ~${Number(mv.value).toFixed(2)}{" "}
                                  <span style={{ opacity: 0.6, fontSize: "0.85em" }}>
                                    ({label})
                                  </span>
                                </span>
                              </>
                            );
                          })()}
                      </div>

                      {tab === "owned" && !isPublicPreview && (
                        <GradeEditor
                          collectionId={item.id}
                          isPro={isPro}
                          initialData={liveGrade}
                          canonicalCover={comic.cover || null}
                          releaseYear={comic.year || null}
                          onSave={(updated) =>
                            setGradeData((prev) => ({
                              ...prev,
                              [item.id]: { ...liveGrade, ...updated },
                            }))
                          }
                        />
                      )}
                    </div>

                    <div className="library-list-actions">
                      {tab === "owned" && !isPublicPreview && (
                        <button
                          className="library-row-btn"
                          onClick={() => toggleForSale(item)}
                          type="button"
                        >
                          {item.status === "for_sale" ? "Remove Sale Flag" : "Mark For Sale"}
                        </button>
                      )}
                      {/* Unlink — only on GCD-linked rows, only in manage mode.
                          Undoes a bad catalog-link by removing the row so user
                          can re-add via search. */}
                      {!isPublicPreview && item.gcd_issue_id != null && (
                        <button
                          className="library-row-btn"
                          onClick={() => handleUnlinkRow(item)}
                          type="button"
                          title="Unlink this row from the catalog and remove it"
                          style={{ color: "rgba(255,200,150,0.85)" }}
                        >
                          Unlink
                        </button>
                      )}
                      <Link href={getLibraryHref(item, comic)} className="library-row-btn primary">
                        View
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!loading && filteredItems.length > 0 && viewMode === "list" && (
            <PaginationBar page={page} setPage={setPage} totalCount={filteredItems.length} pageSize={LIBRARY_PAGE_SIZE} />
          )}

          {/* ── ROWS VIEW (series-collapse) ──
              One row per (title, year) group with a thumb + issue summary.
              Click to expand and reveal the existing list-row rendering
              (with full GradeEditor for owned items). Best for collectors
              with dense runs across many series and for mobile density. */}
          {!loading && filteredItems.length > 0 && viewMode === "rows" && (() => {
            const groups = new Map();
            for (const item of filteredItems) {
              const c = item.comic || {};
              const title = c.title || "Untitled";
              // Group by title only — all volumes of e.g. "Fantastic Four"
              // collapse into one row regardless of launch year. Matches the
              // profile Rows view behavior.
              const key = title;
              let g = groups.get(key);
              if (!g) {
                g = { key, title, years: new Set(), publisher: c.publisher, cover: null, items: [] };
                groups.set(key, g);
              }
              if (c.year) g.years.add(Number(c.year));
              g.items.push(item);
              if (!g.cover) {
                const liveGrade = gradeData[item.id];
                const userCover = USER_COVER_UPLOAD_ENABLED
                  ? resolveUserCover(liveGrade?.user_cover_url ?? item.user_cover_url)
                  : null;
                g.cover = c.cover || userCover || null;
              }
            }
            const groupList = [...groups.values()].map((g) => {
              const years = [...g.years].filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
              g.year = years.length === 0 ? "" : years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`;
              return g;
            }).sort((a, b) => a.title.localeCompare(b.title));

            // Paginate by GROUP, not raw item count — a series' issues
            // shouldn't split across pages just because the running item
            // total crossed LIBRARY_PAGE_SIZE mid-group.
            const pagedGroupList = groupList.slice(
              (page - 1) * LIBRARY_ROWS_PAGE_SIZE,
              page * LIBRARY_ROWS_PAGE_SIZE
            );

            // Compress numeric issue#s into "#1, #3-7" style ranges.
            const formatRanges = (items) => {
              const nums = [], extras = [];
              for (const it of items) {
                const raw = String(it.comic?.issueNumber || "").trim();
                if (!raw) continue;
                const m = raw.match(/^-?\d+(\.\d+)?/);
                if (m) nums.push(Number(m[0]));
                else extras.push(raw);
              }
              nums.sort((a, b) => a - b);
              const ranges = [];
              let start = null, prev = null;
              for (const n of nums) {
                if (start === null) { start = n; prev = n; continue; }
                if (n === prev + 1) { prev = n; continue; }
                ranges.push(start === prev ? `#${start}` : `#${start}-${prev}`);
                start = n; prev = n;
              }
              if (start !== null) ranges.push(start === prev ? `#${start}` : `#${start}-${prev}`);
              return [...ranges, ...extras.map(s => `#${s}`)].join(", ");
            };

            return (
              <>
              <ul className="series-rows">
                {pagedGroupList.map((g) => {
                  const open = expandedSeries.has(g.key);
                  const summary = formatRanges(g.items)
                    || `${g.items.length} item${g.items.length === 1 ? "" : "s"}`;
                  const totalValue = g.items.reduce((sum, it) => {
                    const v = Number(gradeData[it.id]?.market_value ?? it.market_value);
                    return Number.isFinite(v) && v > 0 ? sum + v : sum;
                  }, 0);
                  return (
                    <li key={g.key} className={`series-row ${open ? "is-open" : ""}`}>
                      <button
                        type="button"
                        className="series-row-head"
                        onClick={() => toggleSeriesExpanded(g.key)}
                        aria-expanded={open}
                      >
                        <div className="series-row-thumb">
                          {g.cover ? (
                            <img src={g.cover} alt="" loading="lazy" />
                          ) : (
                            <div className="series-row-thumb-empty" />
                          )}
                        </div>
                        <div className="series-row-body">
                          <div className="series-row-title">
                            {g.title}
                            {g.year ? <span className="series-row-year"> ({g.year})</span> : null}
                          </div>
                          <div className="series-row-meta">
                            <span className="series-row-count">
                              {g.items.length} issue{g.items.length === 1 ? "" : "s"}
                            </span>
                            <span className="series-row-dot">·</span>
                            <span className="series-row-summary">{summary}</span>
                            {totalValue > 0 && (
                              <>
                                <span className="series-row-dot">·</span>
                                <span className="series-row-value">${totalValue.toLocaleString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="series-row-chevron" aria-hidden>
                          {open ? "▾" : "▸"}
                        </span>
                      </button>
                      {open && (
                        <div className="series-row-grid library-list">
                          {g.items.map((item) => {
                            const comic = item.comic;
                            const liveGrade = gradeData[item.id] ?? {
                              grade_numeric: item.grade_numeric ?? null,
                              condition: item.condition ?? null,
                              slab_company: item.slab_company ?? null,
                              slab_cert_number: item.slab_cert_number ?? null,
                              notes: item.notes ?? null,
                              purchase_price: item.purchase_price ?? null,
                              market_value: item.market_value ?? null,
                              user_cover_url: USER_COVER_UPLOAD_ENABLED ? (item.user_cover_url ?? null) : null,
                            };
                            const displayCover =
                              resolveUserCover(liveGrade.user_cover_url) ||
                              comic.cover ||
                              "/fallback-cover.png";
                            return (
                              <article
                                key={`${item.id}-${item.libraryKey}-${item.status}`}
                                className="library-list-row"
                              >
                                <Link href={getLibraryHref(item, comic)} className="library-list-cover">
                                  <img src={displayCover} alt={comic.title} loading="lazy" />
                                </Link>
                                <div className="library-list-main">
                                  <Link href={getLibraryHref(item, comic)} className="library-list-title">
                                    {comic.title}
                                    {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                                    {item.variant_label ? (
                                      <span style={{ opacity: 0.7, fontWeight: 500 }}> ({item.variant_label})</span>
                                    ) : null}
                                    {item.copy_number > 1 ? (
                                      <span style={{ opacity: 0.55, fontWeight: 500, fontSize: "0.85em" }}> · Copy {item.copy_number}</span>
                                    ) : null}
                                  </Link>
                                  <div className="library-list-meta">
                                    <span>{comic.year || "Unknown Year"}</span>
                                    {liveGrade.slab_company && (
                                      <>
                                        <span>•</span>
                                        <span>{liveGrade.slab_company} {Number(liveGrade.grade_numeric).toFixed(1)}</span>
                                      </>
                                    )}
                                    {liveGrade.market_value > 0 && (
                                      <>
                                        <span>•</span>
                                        <span style={{ color: "#4ade80" }}>${Number(liveGrade.market_value).toLocaleString()}</span>
                                      </>
                                    )}
                                  </div>
                                  {tab === "owned" && !isPublicPreview && (
                                    <div style={{ marginTop: 6 }}>
                                      <GradeEditor
                                        collectionId={item.id}
                                        isPro={isPro}
                                        initialData={liveGrade}
                                        canonicalCover={comic.cover || null}
                                        releaseYear={comic.year || null}
                                        onSave={(updated) =>
                                          setGradeData((prev) => ({
                                            ...prev,
                                            [item.id]: { ...liveGrade, ...updated },
                                          }))
                                        }
                                      />
                                    </div>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <PaginationBar page={page} setPage={setPage} totalCount={groupList.length} pageSize={LIBRARY_ROWS_PAGE_SIZE} />
              </>
            );
          })()}

          {/* ── GRID VIEW ── */}
          {!loading && filteredItems.length > 0 && viewMode === "grid" && (
            <div className="comic-grid">
              {filteredItems.slice((page - 1) * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE).map((item) => {
                const comic = item.comic;
                const liveGrade = gradeData[item.id] ?? {
                  grade_numeric: item.grade_numeric ?? null,
                  condition: item.condition ?? null,
                  slab_company: item.slab_company ?? null,
                  slab_cert_number: item.slab_cert_number ?? null,
                  notes: item.notes ?? null,
                  purchase_price: item.purchase_price ?? null,
                  market_value: item.market_value ?? null,
                  user_cover_url: USER_COVER_UPLOAD_ENABLED ? (item.user_cover_url ?? null) : null,
                };

                const displayCover =
                  resolveUserCover(liveGrade.user_cover_url) ||
                  comic.cover ||
                  "/fallback-cover.png";

                return (
                  <article
                    key={`${item.id}-${item.libraryKey}-${item.status}`}
                    className="comic-card"
                  >
                    <Link href={getLibraryHref(item, comic)} className="card-link">
                      <div className="comic-card-cover">
                        <img
                          src={displayCover}
                          alt={comic.title}
                          loading="lazy"
                        />
                        {USER_COVER_UPLOAD_ENABLED && liveGrade.user_cover_url && (
                          <span className="library-cover-tag" title="Your photo">Your photo</span>
                        )}
                      </div>
                      <div className="comic-card-title">
                        {comic.title}
                        {comic.issueNumber ? ` #${comic.issueNumber}` : ""}
                        {item.variant_label ? (
                          <span style={{ opacity: 0.7, fontWeight: 500 }}> ({item.variant_label})</span>
                        ) : null}
                      </div>
                      <div className="comic-card-meta">
                        {comic.publisher || "Unknown Publisher"} • {comic.year || "Unknown"}
                        {item.copy_number > 1 ? ` · Copy ${item.copy_number}` : ""}
                      </div>
                    </Link>

                    {(liveGrade.grade_numeric || liveGrade.condition) && (
                      <div style={{ padding: "4px 10px 0" }}>
                        <GradeBadge
                          grade={liveGrade.grade_numeric}
                          company={liveGrade.slab_company}
                          condition={liveGrade.condition}
                        />
                      </div>
                    )}

                    {tab === "owned" && !isPublicPreview && (
                      <div className="comic-card-grade">
                        <GradeEditor
                          collectionId={item.id}
                          isPro={isPro}
                          initialData={liveGrade}
                          canonicalCover={comic.cover || null}
                          releaseYear={comic.year || null}
                          onSave={(updated) =>
                            setGradeData((prev) => ({
                              ...prev,
                              [item.id]: { ...liveGrade, ...updated },
                            }))
                          }
                          />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
          {!loading && filteredItems.length > 0 && viewMode === "grid" && (
            <PaginationBar page={page} setPage={setPage} totalCount={filteredItems.length} pageSize={LIBRARY_PAGE_SIZE} />
          )}
        </section>
      </section>

      {/* Catalog-link picker modal — opens when the user clicks "Choose match…"
          or "Search…" on a row in the catalog-linking audit panel. */}
      {pickerEntry && (
        <CatalogLinkPicker
          entry={pickerEntry}
          userId={user.id}
          onApply={(gcd_issue_id) => handleApplySingleLink(pickerEntry.collection_id, gcd_issue_id)}
          onClose={() => setPickerEntry(null)}
        />
      )}
    </main>
  );
}
