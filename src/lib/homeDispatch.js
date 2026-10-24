import { unstable_cache } from "next/cache";
import { getServiceClient } from "./supabase/service.js";
import { SITE_NEWS } from "@/lib/siteNews";

// Data for the homepage: the live catalog numbers in the proof strip and the
// "Dispatch" feed (new covers this week, blog posts, site updates). Read on
// the server and cached for an hour, so the static homepage never waits on
// it. Each part fails on its own: a broken read drops that part (and is
// logged) rather than blanking the section or caching a wrong zero.

// One retry: these counts can take a few seconds and occasionally hit the
// statement timeout when the database is busy (a HEAD request reports that
// as an error with an empty message).
// `build` is a thunk: a PostgREST builder can only be awaited once.
async function count(build, retried = false) {
  const { count: n, error } = await build();
  if (error || !Number.isFinite(n)) {
    if (!retried) {
      await new Promise((r) => setTimeout(r, 1500));
      return count(build, true);
    }
    throw error?.message ? error : new Error(`count failed (${error?.code ?? "no count"})`);
  }
  return n;
}

async function loadStats(sb) {
  // Planner estimates: these tables are large and the strip shows rounded
  // "217,000+" style numbers anyway.
  const [series, issues, covers, variants] = await Promise.all([
    count(() => sb.from("series").select("id", { count: "estimated", head: true })),
    count(() => sb.from("gcd_issues").select("gcd_id", { count: "estimated", head: true })),
    count(() => sb.from("canonical_covers").select("id", { count: "estimated", head: true })),
    count(() => sb.from("cover_variants").select("id", { count: "estimated", head: true })),
  ]);
  return { series, issues, covers: covers + variants };
}

const STRIP_PUBLISHERS = new Set([
  "Marvel Comics", "DC Comics", "Image Comics", "Dark Horse Comics", "Oni Press",
  "Archie Comics", "Valiant Comics", "BOOM! Studios", "Dynamite Entertainment", "Harvey Comics",
]);
// Big publishers still have the odd adult title.
const STRIP_TITLE_BLOCK = /\b(sex|sexy|nude|naked|erotic|porn|xxx|playboy|penthouse|fetish)\b/i;

async function loadNewCovers(sb) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const added = await count(() =>
    sb.from("canonical_covers").select("id", { count: "exact", head: true }).gte("created_at", since)
  );
  // The newest covers usually arrive a whole run at a time, and often for
  // foreign reprint editions search doesn't show (on 2026-10-24 the newest
  // 300 were four series, three of them Italian or Brazilian), and the rest
  // is wide open: Fantagraphics' adult line led the US covers that day. This
  // strip is the first thing a stranger sees, so read up to 3,000 of the
  // newest and keep US-market series from mainstream publishers, one cover
  // per series.
  const strip = [];
  const seen = new Set();
  for (let page = 0; page < 3 && strip.length < 11; page++) {
    const { data, error } = await sb
      .from("canonical_covers")
      .select("storage_path, series_title, series_gcd_id, issue_number, gcd_issue_id, created_at")
      .not("storage_path", "is", null)
      .order("created_at", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    const ids = [...new Set((data ?? []).map((row) => row.series_gcd_id).filter((id) => id != null))];
    const usSeries = new Set();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: rows, error: seriesError } = await sb
        .from("series")
        .select("gcd_id, resolved_publisher_cached")
        .eq("us_market", true)
        .in("gcd_id", ids.slice(i, i + 200));
      if (seriesError) throw seriesError;
      for (const row of rows ?? []) {
        if (STRIP_PUBLISHERS.has(row.resolved_publisher_cached)) usSeries.add(row.gcd_id);
      }
    }
    for (const row of data ?? []) {
      if (strip.length === 11) break;
      const key = (row.series_title ?? "").toLowerCase();
      if (!key || seen.has(key) || !usSeries.has(row.series_gcd_id) || STRIP_TITLE_BLOCK.test(row.series_title)) continue;
      seen.add(key);
      strip.push({
        title: `${row.series_title}${row.issue_number ? ` #${row.issue_number}` : ""}`,
        cover: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${row.storage_path}`,
        href: row.gcd_issue_id != null ? `/issue/gcd-${row.gcd_issue_id}` : null,
      });
    }
  }
  return { added, strip };
}

async function loadPosts(sb) {
  const { data, error } = await sb
    .from("blog_posts")
    .select("title, slug, excerpt, published_at, created_at")
    .eq("published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(4);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    kind: "read",
    date: (p.published_at ?? p.created_at ?? "").slice(0, 10),
    title: p.title,
    body: p.excerpt ?? null,
    href: `/blog/${p.slug}`,
  }));
}

// Thrown (not returned) when any part failed, carrying what did load:
// unstable_cache does not store a rejected call, so one slow moment can't
// leave the homepage without its numbers or cover strip for an hour.
class PartialHomeData extends Error {
  constructor(data) {
    super("home data partially failed");
    this.data = data;
  }
}

const settle = (label, p) =>
  p.catch((err) => {
    console.error(`homeDispatch ${label}:`, err);
    return null;
  });

async function computeHomeData() {
  const sb = getServiceClient();
  const [stats, newCovers, posts] = await Promise.all([
    settle("stats", loadStats(sb)),
    settle("new covers", loadNewCovers(sb)),
    settle("posts", loadPosts(sb)),
  ]);
  const updates = SITE_NEWS.map((n) => ({ kind: "update", ...n }));
  const feed = [...updates, ...(posts ?? [])]
    .filter((item) => item.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const result = { stats, newCovers, feed };
  if (!stats || !newCovers || !posts) throw new PartialHomeData(result);
  return result;
}

const cachedHomeData = unstable_cache(computeHomeData, ["home-dispatch-v11"], { revalidate: 3600 });

// { stats: {series, issues, covers} | null, newCovers: {added, strip} | null, feed: [...] }
export async function getHomeData() {
  try {
    return await cachedHomeData();
  } catch (err) {
    if (err?.data) return err.data;
    console.error("homeDispatch failed:", err);
    return { stats: null, newCovers: null, feed: SITE_NEWS.slice(0, 5).map((n) => ({ kind: "update", ...n })) };
  }
}
