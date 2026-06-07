"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLibrary } from "@/context/LibraryContext";
import { useAuth } from "@/context/AuthContext";
import { getSupabaseClient } from "@/lib/supabase/client";
import GradeEditor, { GradeBadge } from "@/components/GradeEditor";
import EmptyState from "@/components/EmptyState";
import CatalogLinkPicker from "@/components/CatalogLinkPicker";

const hydrationCache = new Map();

const USER_COVER_UPLOAD_ENABLED = true;

function getLibraryHref(item, comic) {
  if (comic?.href) return comic.href;
  if (item?.gcd_issue_id != null) return `/issue/gcd-${item.gcd_issue_id}`;
  if (item?.comic_id != null) return `/comic/${item.comic_id}`;
  return "/library";
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
  const { collections, loading, loadError, refreshLibrary } = useLibrary();
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
  const [comicIndex, setComicIndex] = useState(() => Object.fromEntries(hydrationCache));

  // hydrationCache is module-scoped and survives navigation/sign-out, which
  // means a previous account's hydrated covers can flash before the new
  // user's data loads. Wipe it whenever the active user changes.
  useEffect(() => {
    hydrationCache.clear();
    setComicIndex({});
  }, [user?.id]);
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
      const res = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
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
      const res = await fetch(
        `/api/library/catalog-link?user_id=${encodeURIComponent(user.id)}`,
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
      const res = await fetch("/api/library/catalog-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
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

  async function handleApplySingleLink(collection_id, gcd_issue_id) {
    if (!user) return;
    try {
      const res = await fetch("/api/library/catalog-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
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
      const res = await fetch("/api/export/wantlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
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
      const res = await fetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
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
        if (hydrationCache.has(key)) {
          cachedAdditions[key] = hydrationCache.get(key);
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
          hydrationCache.set(key, normalized);
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

  // Phase 1 unify: dominantDecade for the "Era focus" sidebar widget.
  // Mirrors the public-profile's compute so /library and /u/[name] surface
  // the same insight under the same name.
  const dominantDecade = useMemo(() => {
    const decadeCounts = {};
    for (const item of libraryItems) {
      const year = Number(item.comic?.year);
      if (!year) continue;
      const decade = Math.floor(year / 10) * 10;
      decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
    }
    const top = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }, [libraryItems]);

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
      <section className="library-page-header">
        <div>
          <div className="library-kicker">Collection Management</div>
          <h1 className="library-title">My Library</h1>
          <p className="library-subtitle">
            Manage your collection, wantlist, and CSV imports from one place.
          </p>
          {profile?.username && (
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
          {user && (
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
              <Link href="/library/add" className="library-primary-btn">
                Add Comic
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
            fd.append("user_id", user.id);
            const res = await fetch("/api/csv-import", { method: "POST", body: fd });
            // Pro-gated row cap. 402 = exceeded the free cap; surface the
            // server's explanation in the import-summary panel AND offer a
            // direct route to /upgrade so users can act on it.
            if (res.status === 402) {
              const json = await res.json().catch(() => ({}));
              const proceed = window.confirm(
                `${json.error || "Upgrade required to import this many rows."}\n\nGo to the upgrade page now?`
              );
              if (proceed) window.location.href = "/upgrade";
              setCsvResult({
                created: 0,
                reused: 0,
                skipped: json.attempted ?? 0,
                errors: [{ row: "-", message: json.error || "Upgrade to Pro to import more rows" }],
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
            title={isPro ? "Pro: up to 200 rows per import" : "Free: up to 25 rows per import. Upgrade to Pro for 200."}
          >
            Upload CSV
          </button>
        </form>
      </section>

      <section className="library-stats-row">
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.totalInView}</div>
          <div className="library-stat-label">{tab === "owned" ? "Books in Collection" : "Books on Wantlist"}</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.uniqueSeries}</div>
          <div className="library-stat-label">Unique Series</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.uniquePublishers}</div>
          <div className="library-stat-label">Publishers</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.ownedCount}</div>
          <div className="library-stat-label">Total Owned</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.wishlistCount}</div>
          <div className="library-stat-label">Total Wantlist</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.slabbedCount}</div>
          <div className="library-stat-label">Slabbed</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">
            {stats.collectionValue > 0
              ? new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(stats.collectionValue)
              : "—"}
          </div>
          <div className="library-stat-label">Collection Value</div>
        </div>
        <div className="library-stat-card">
          <div className="library-stat-number">{stats.newestYear}</div>
          <div className="library-stat-label">Newest Year in View</div>
        </div>
      </section>

      {/* ── Catalog linking (Pro) ─────────────────────────────────────────
          Local-only books (added by CSV import or the manual /library/add
          form before a GCD match existed) are invisible to arc completion,
          run tracking, and future automatic valuation. This panel scans
          for matches in our catalog and offers a one-click upgrade. */}
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

      {/* ── Library health: hybrid duplicates ─────────────────────────────
          Surfaces when an issue is tracked once locally and once via GCD —
          a real data-hygiene problem caused by adding a book before our
          catalog had a match, then again after. Same-key dupes are blocked
          by the write path, so this is the only meaningful dupe class. */}
      {duplicates.length > 0 && (
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

          {/* Phase 1 unify: insight widgets matching the public profile. Each
              one hides when there's no signal so the sidebar doesn't show
              empty rows for a brand-new collector. */}
          {(dominantDecade || stats.ownedCount > 0) && (
            <div className="library-sidebar-section">
              <div className="library-sidebar-title">About this collection</div>
              <dl
                style={{
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  rowGap: 6,
                  columnGap: 12,
                  fontSize: "0.85rem",
                }}
              >
                {dominantDecade && (
                  <>
                    <dt style={{ opacity: 0.65 }}>Era focus</dt>
                    <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>
                      {dominantDecade}s
                    </dd>
                  </>
                )}
                {stats.ownedCount > 0 && (
                  <>
                    <dt style={{ opacity: 0.65 }}>Slab ratio</dt>
                    <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>
                      {stats.slabRatio}%
                    </dd>
                  </>
                )}
                {stats.uniqueSeries > 0 && (
                  <>
                    <dt style={{ opacity: 0.65 }}>Unique series</dt>
                    <dd style={{ margin: 0, textAlign: "right", fontWeight: 600 }}>
                      {stats.uniqueSeries}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {availablePublishers.length > 0 && (
            <div className="library-sidebar-section">
              <div className="library-sidebar-title">Top publishers</div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {availablePublishers.slice(0, 5).map((pub) => (
                  <li
                    key={pub.name}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      fontSize: "0.85rem",
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span style={{ opacity: 0.85 }}>{pub.name}</span>
                    <span style={{ fontWeight: 600, opacity: 0.65 }}>{pub.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                  className={`library-view-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  className={`library-view-btn ${viewMode === "grid" ? "active" : ""}`}
                  onClick={() => setViewMode("grid")}
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
              if (totalInTab === 0) {
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
              {filteredItems.map((item) => {
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
                  liveGrade.user_cover_url || comic.cover || "/fallback-cover.png";

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
                        {/* Auto-value from market_comps — only render when no
                            user override exists. Sample size is shown so users
                            can judge confidence (e.g. "auto, 1 sale" is weak). */}
                        {liveGrade.market_value == null &&
                          marketValues[item.id]?.value != null && (
                            <>
                              <span>•</span>
                              <span
                                style={{ color: "var(--cc-gold)" }}
                                title={`Median of ${marketValues[item.id].sample_size} recent sale${marketValues[item.id].sample_size === 1 ? "" : "s"} in bucket ${marketValues[item.id].bucket_used}${marketValues[item.id].fallback ? " (fallback bucket)" : ""}`}
                              >
                                Worth ~${Number(marketValues[item.id].value).toFixed(2)}{" "}
                                <span style={{ opacity: 0.6, fontSize: "0.85em" }}>
                                  (auto, {marketValues[item.id].sample_size}
                                  {marketValues[item.id].sample_size === 1 ? " sale" : " sales"})
                                </span>
                              </span>
                            </>
                          )}
                      </div>

                      {tab === "owned" && (
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
                      {tab === "owned" && (
                        <button
                          className="library-row-btn"
                          onClick={() => toggleForSale(item)}
                          type="button"
                        >
                          {item.status === "for_sale" ? "Remove Sale Flag" : "Mark For Sale"}
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

          {/* ── GRID VIEW ── */}
          {!loading && filteredItems.length > 0 && viewMode === "grid" && (
            <div className="comic-grid">
              {filteredItems.map((item) => {
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
                  liveGrade.user_cover_url || comic.cover || "/fallback-cover.png";

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
                      </div>
                      <div className="comic-card-meta">
                        {comic.publisher || "Unknown Publisher"} • {comic.year || "Unknown"}
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

                    {tab === "owned" && (
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