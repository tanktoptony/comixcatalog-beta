import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function hasKnownPublisher(row) {
  const name = row?.publisher?.name ?? "";
  return !!name && name !== "Unknown Publisher";
}

function normalizeSearch(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeTitleKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = String(row?.id ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function dedupeByCanonicalKey(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = row.gcd_id
      ? `gcd:${row.gcd_id}`
      : `title:${normalizeSearch(row.title)}`;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function normalizePublisherName(value) {
  return String(value ?? "").trim();
}

function isSuspiciousPublisherName(publisherName, seriesTitle) {
  const pub = normalizePublisherName(publisherName).toLowerCase();
  const title = String(seriesTitle ?? "").trim().toLowerCase();

  if (!pub) return true;
  if (pub === "unknown publisher") return true;

  if (title && pub.includes(title)) return true;

  if (
    pub.includes("publishing company") ||
    pub.includes("publishing co") ||
    pub.includes("company inc") ||
    pub.includes("publications inc") ||
    pub.includes("publishers inc") ||
    pub.includes("comics inc")
  ) {
    return true;
  }

  return false;
}

function normalizePublisherLabel(value) {
  const pub = String(value ?? "").trim();
  if (!pub) return null;

  const lower = pub.toLowerCase();

  const exactMap = {
    "marvel": "Marvel Comics",
    "marvel comics": "Marvel Comics",
    "marvel comics group": "Marvel Comics",
    "marvel comic": "Marvel Comics",

    "atlas magazines": "Marvel Comics",
    "atlas magazines inc": "Marvel Comics",
    "atlas magazines inc.": "Marvel Comics",
    "magazine management": "Marvel Comics",
    "magazine management co inc": "Marvel Comics",
    "magazine management co. inc.": "Marvel Comics",
    "magazine management co., inc.": "Marvel Comics",

    "dc": "DC Comics",
    "dc comics": "DC Comics",
    "dc comics inc": "DC Comics",
    "dc comics inc.": "DC Comics",
    "dc comics, inc.": "DC Comics",
    "dc comics group": "DC Comics",
    "detective comics": "DC Comics",
    "detective comics inc": "DC Comics",
    "detective comics inc.": "DC Comics",
    "detective comics, inc.": "DC Comics",
    "national periodical publications": "DC Comics",
    "national periodical publications inc": "DC Comics",
    "national periodical publications inc.": "DC Comics",

    "top cow": "Top Cow Comics",
    "top cow comics": "Top Cow Comics",

    "image": "Image Comics",
    "image comics": "Image Comics",
    "image comics inc": "Image Comics",
    "image comics, inc.": "Image Comics",

    "dark horse": "Dark Horse Comics",
    "dark horse comics": "Dark Horse Comics",
    "dark horse comics inc.": "Dark Horse Comics",

    "boom": "BOOM! Studios",
    "boom studios": "BOOM! Studios",
    "boom! studios": "BOOM! Studios",

    "idw": "IDW Publishing",
    "idw publishing": "IDW Publishing",

    "vertigo": "Vertigo",
    "vertigo comics": "Vertigo",

    "archie": "Archie Comics",
    "archie comics": "Archie Comics",

    "valiant": "Valiant Comics",
    "valiant comics": "Valiant Comics",

    "dynamite": "Dynamite Entertainment",
    "dynamite entertainment": "Dynamite Entertainment",

    "wonder woman publishing company inc": "DC Comics",
    "wonder woman publishing company inc.": "DC Comics",
    "olympia publications inc": "Marvel Comics",
    "olympia publications inc.": "Marvel Comics",
  };

  if (exactMap[lower]) return exactMap[lower];

  if (lower.includes("marvel")) return "Marvel Comics";
  if (lower.includes("atlas magazines")) return "Marvel Comics";
  if (lower.includes("magazine management")) return "Marvel Comics";

  if (lower.includes("dc comics")) return "DC Comics";
  if (lower.includes("detective comics")) return "DC Comics";
  if (lower.includes("national periodical")) return "DC Comics";

  if (lower.includes("top cow")) return "Top Cow Comics";
  if (lower.includes("image")) return "Image Comics";
  if (lower.includes("dark horse")) return "Dark Horse Comics";
  if (lower.includes("boom")) return "BOOM! Studios";
  if (lower.includes("idw")) return "IDW Publishing";
  if (lower.includes("vertigo")) return "Vertigo";
  if (lower.includes("archie")) return "Archie Comics";
  if (lower.includes("valiant")) return "Valiant Comics";
  if (lower.includes("dynamite")) return "Dynamite Entertainment";

  return null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const normalizedQ = normalizeSearch(q);

    if (!q) {
      return NextResponse.json({ series: [] });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: rawSeries, error: seriesError } = await supabase
      .from("series")
      .select(`
        id,
        gcd_id,
        title,
        publisher_id,
        publisher:publisher_id (
          id,
          name,
          gcd_id
        )
      `)
      .ilike("title", `%${q}%`)
      .limit(100);

    if (seriesError) {
      console.error("GET /api/search/series failed:", seriesError);
      return NextResponse.json({ series: [] });
    }

    let rows = (rawSeries ?? []).filter((row) => {
      if (!normalizedQ) return true;
      return normalizeSearch(row.title).includes(normalizedQ);
    });

    rows = rows.filter((row) => row?.gcd_id);

    if (rows.length === 0) {
      return NextResponse.json({ series: [] });
    }

    const uniqueSeriesGcdIds = [
      ...new Set(rows.map((row) => row.gcd_id).filter(Boolean)),
    ];

    const { data: issueRows, error: issueError } = await supabase
      .from("gcd_issues")
      .select("series_gcd_id, publisher_gcd_id")
      .in("series_gcd_id", uniqueSeriesGcdIds)
      .limit(5000);

    if (issueError) {
      console.error("GET /api/search/series issue coverage failed:", issueError);
      return NextResponse.json({ series: [] });
    }

    const issueCountBySeriesGcdId = {};
    const issuePublisherGcdLookup = {};

    for (const row of issueRows ?? []) {
      const seriesKey = String(row.series_gcd_id);

      issueCountBySeriesGcdId[seriesKey] =
        (issueCountBySeriesGcdId[seriesKey] ?? 0) + 1;

      if (!issuePublisherGcdLookup[seriesKey] && row.publisher_gcd_id) {
        issuePublisherGcdLookup[seriesKey] = String(row.publisher_gcd_id);
      }
    }

    rows = rows.filter((row) => {
      const count = issueCountBySeriesGcdId[String(row.gcd_id)] ?? 0;
      return count > 0;
    });

    if (rows.length === 0) {
      return NextResponse.json({ series: [] });
    }

    const publisherGcdIds = [
      ...new Set(Object.values(issuePublisherGcdLookup).filter(Boolean)),
    ];

    let gcdPublisherLookup = {};
    if (publisherGcdIds.length > 0) {
      const { data: gcdPublishers, error: gcdPublisherError } = await supabase
        .from("gcd_publishers")
        .select("gcd_id, name")
        .in("gcd_id", publisherGcdIds);

      if (gcdPublisherError) {
        console.error(
          "GET /api/search/series gcd publisher fallback failed:",
          gcdPublisherError
        );
      } else {
        gcdPublisherLookup = Object.fromEntries(
          (gcdPublishers ?? []).map((row) => [String(row.gcd_id), row.name])
        );
      }
    }

    const mapped = rows.map((row) => {
      const localPublisherName = row.publisher?.name ?? null;
      const fallbackPublisherName =
        gcdPublisherLookup[issuePublisherGcdLookup[String(row.gcd_id)]] ?? null;

      const normalizedLocalPublisher =
        normalizePublisherLabel(localPublisherName);
      const normalizedFallbackPublisher =
        normalizePublisherLabel(fallbackPublisherName);

      const trustedLocalPublisher = !isSuspiciousPublisherName(
        localPublisherName,
        row.title
      )
        ? localPublisherName
        : null;

      const trustedFallbackPublisher = !isSuspiciousPublisherName(
        fallbackPublisherName,
        row.title
      )
        ? fallbackPublisherName
        : null;

      const resolvedPublisher =
        normalizedLocalPublisher ??
        normalizedFallbackPublisher ??
        trustedLocalPublisher ??
        trustedFallbackPublisher ??
        "Unknown Publisher";

      return {
        id: row.id,
        gcd_id: row.gcd_id ?? null,
        title: row.title ?? "Untitled Series",
        issue_count: issueCountBySeriesGcdId[String(row.gcd_id)] ?? 0,
        publisher: {
          name: resolvedPublisher,
        },
      };
    });

    const grouped = new Map();

    for (const row of mapped) {
      const key = normalizeTitleKey(row.title);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const cleaned = [];

    for (const groupRows of grouped.values()) {
      const sortedGroup = [...groupRows].sort((a, b) => {
        const aTitle = normalizeSearch(a.title);
        const bTitle = normalizeSearch(b.title);

        const aExact = aTitle === normalizedQ ? 1 : 0;
        const bExact = bTitle === normalizedQ ? 1 : 0;
        if (bExact !== aExact) return bExact - aExact;

        const aStarts = aTitle.startsWith(normalizedQ) ? 1 : 0;
        const bStarts = bTitle.startsWith(normalizedQ) ? 1 : 0;
        if (bStarts !== aStarts) return bStarts - aStarts;

        const aKnownPublisher = hasKnownPublisher(a) ? 1 : 0;
        const bKnownPublisher = hasKnownPublisher(b) ? 1 : 0;
        if (bKnownPublisher !== aKnownPublisher) {
          return bKnownPublisher - aKnownPublisher;
        }

        if ((b.issue_count ?? 0) !== (a.issue_count ?? 0)) {
          return (b.issue_count ?? 0) - (a.issue_count ?? 0);
        }

        return a.title.localeCompare(b.title);
      });

      const best = sortedGroup[0];

      const kept = sortedGroup.filter((row, idx) => {
        if (idx === 0) return true;

        const samePublisher =
          (row.publisher?.name ?? "") === (best.publisher?.name ?? "");

        if (!hasKnownPublisher(row) && hasKnownPublisher(best)) return false;
        if ((row.issue_count ?? 0) < 5 && (best.issue_count ?? 0) >= 20) return false;
        if (samePublisher && (row.issue_count ?? 0) < (best.issue_count ?? 0)) return false;

        return true;
      });

      cleaned.push(...kept.slice(0, 2));
    }

    cleaned.sort((a, b) => {
      const aTitle = normalizeSearch(a.title);
      const bTitle = normalizeSearch(b.title);

      const aExact = aTitle === normalizedQ ? 1 : 0;
      const bExact = bTitle === normalizedQ ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;

      const aStarts = aTitle.startsWith(normalizedQ) ? 1 : 0;
      const bStarts = bTitle.startsWith(normalizedQ) ? 1 : 0;
      if (bStarts !== aStarts) return bStarts - aStarts;

      const aKnownPublisher = hasKnownPublisher(a) ? 1 : 0;
      const bKnownPublisher = hasKnownPublisher(b) ? 1 : 0;
      if (bKnownPublisher !== aKnownPublisher) return bKnownPublisher - aKnownPublisher;

      if ((b.issue_count ?? 0) !== (a.issue_count ?? 0)) {
        return (b.issue_count ?? 0) - (a.issue_count ?? 0);
      }

      return a.title.localeCompare(b.title);
    });

    return NextResponse.json({
      series: dedupeByCanonicalKey(dedupeById(cleaned)).slice(0, 12),
    });
  } catch (err) {
    console.error("GET /api/search/series crashed:", err);
    return NextResponse.json({ series: [] });
  }
}