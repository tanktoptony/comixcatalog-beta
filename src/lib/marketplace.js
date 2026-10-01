import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/fetchAllPages";
import { POST as libraryHydratePOST } from "@/app/api/library-hydrate/route";

// Marketplace v1 (2026-10-01). A listing is a user_collections row with
// status "for_sale" on a catalog (GCD-linked) issue, owned by a seller whose
// profile is public and who hasn't hidden their for-sale shelf. There is no
// checkout: each listing shows the book's estimated value (the seller's own
// value if set, otherwise the eBay-based auto value) and buyers "Make an
// offer" by messaging the seller.
//
// Titles and covers come from /api/library-hydrate, called in-process, so a
// listing always shows the same issue and cover as the seller's library and
// the issue page.

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function estValue(row) {
  for (const v of [row.market_value, row.auto_market_value]) {
    const n = Number(v);
    if (v != null && Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

async function hydrate(gcdIds) {
  const items = {};
  // The hydrate route handles whole collections; chunk to keep each call
  // inside the function's time budget.
  for (let i = 0; i < gcdIds.length; i += 500) {
    const res = await libraryHydratePOST(
      new Request("http://internal/api/library-hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comic_ids: [], gcd_issue_ids: gcdIds.slice(i, i + 500), collection_grades: [] }),
      })
    );
    if (!res.ok) throw new Error(`library-hydrate returned ${res.status}`);
    Object.assign(items, (await res.json()).items ?? {});
  }
  return items;
}

async function computeListings() {
  const sb = client();
  const rows = await fetchAllPages(() =>
    sb
      .from("user_collections")
      .select("id, user_id, gcd_issue_id, condition, grade_numeric, slab_company, market_value, auto_market_value, created_at")
      .eq("status", "for_sale")
      .not("gcd_issue_id", "is", null)
  );
  if (rows.length === 0) return [];

  const sellerIds = [...new Set(rows.map((r) => r.user_id))];
  const { data: profiles, error } = await sb
    .from("profiles")
    .select("id, username, is_public, show_for_sale")
    .in("id", sellerIds);
  if (error) throw error;
  const sellers = new Map(
    (profiles ?? [])
      .filter((p) => p.username && p.is_public !== false && p.show_for_sale !== false)
      .map((p) => [p.id, p.username])
  );

  const visible = rows.filter((r) => sellers.has(r.user_id));
  const items = await hydrate([...new Set(visible.map((r) => Number(r.gcd_issue_id)))]);

  return visible
    .map((r) => {
      const item = items[`gcd-${r.gcd_issue_id}`];
      if (!item) return null;
      return {
        id: r.id,
        gcdIssueId: Number(r.gcd_issue_id),
        href: `/issue/gcd-${r.gcd_issue_id}`,
        title: item.title ?? "Untitled",
        issueNumber: item.issueNumber ?? "",
        year: item.year ?? null,
        publisher: item.publisher ?? null,
        cover: item.cover ?? null,
        condition: r.condition ?? null,
        grade: r.grade_numeric != null ? Number(r.grade_numeric) : null,
        slab: r.slab_company ?? null,
        estValue: estValue(r),
        seller: sellers.get(r.user_id),
        listedAt: r.created_at,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.listedAt ?? "").localeCompare(a.listedAt ?? ""));
}

// Every visible listing, newest first. Cached two minutes and shared by the
// marketplace page, its API and issue pages; a failed read throws (never
// cached) so the page can say so instead of showing an empty market.
export const getListings = unstable_cache(computeListings, ["marketplace-listings-v1"], { revalidate: 120 });

export async function getListingsForIssue(gcdIssueId) {
  const all = await getListings();
  return all.filter((l) => l.gcdIssueId === Number(gcdIssueId));
}
