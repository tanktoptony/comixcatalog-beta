import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { canonicalCoverUrl } from "@/lib/catalog/covers";
import { coverThumb } from "@/lib/coverThumb";
import { issueKey, issueNumberOrFilter } from "@/lib/csvImport/matchRow";
import {
  buildPullListUpcoming,
  dedupePullListCovers,
  groupPullListWeeks,
  pullListMonthWindow,
  resolvePullListIssues,
} from "@/lib/pullList";
import { getServiceClient } from "@/lib/supabase/service";

const FOLLOW_CAP = 200;
const PAGE_SIZE = 1000;

function validSeriesId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function chunks(values, size = 200) {
  const rows = [];
  for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size));
  return rows;
}

async function paged(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) return rows;
  }
}

async function parseSeriesId(req) {
  const body = await req.json().catch(() => null);
  return validSeriesId(body?.series_gcd_id);
}

function serverError(error, message) {
  console.error(message, error?.code, error?.message ?? error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to see your pull list." }, { status: 401 });
  const supabase = getServiceClient();
  const requested = new URL(req.url).searchParams.get("series_gcd_id");

  if (requested != null) {
    const seriesGcdId = validSeriesId(requested);
    if (!seriesGcdId) return NextResponse.json({ error: "Choose a valid series." }, { status: 400 });
    const { data, error } = await supabase.from("pull_list_series")
      .select("series_gcd_id")
      .eq("user_id", user.id)
      .eq("series_gcd_id", seriesGcdId)
      .maybeSingle();
    if (error) return serverError(error, "Could not check your pull list.");
    return NextResponse.json({ following: Boolean(data) });
  }

  try {
    // Query 1: followed ids. The remaining six reads are all bulk reads over
    // these ids; no issue or cover creates its own database request.
    const { data: followed, error: followedError } = await supabase.from("pull_list_series")
      .select("series_gcd_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (followedError) throw followedError;
    const seriesIds = (followed ?? []).map((row) => Number(row.series_gcd_id));
    if (!seriesIds.length) return NextResponse.json({ series: [], weeks: [], upcoming: [] });

    // Query 2: app-facing series metadata.
    const seriesRows = [];
    for (const group of chunks(seriesIds)) {
      const { data, error } = await supabase.from("series")
        .select("id,gcd_id,title,year_start_cached,resolved_publisher_cached")
        .in("gcd_id", group);
      if (error) throw error;
      seriesRows.push(...(data ?? []));
    }
    const seriesByGcd = new Map(seriesRows.map((row) => [Number(row.gcd_id), row]));
    const series = seriesIds.map((seriesGcdId) => {
      const row = seriesByGcd.get(seriesGcdId);
      return row ? {
        series_gcd_id: seriesGcdId,
        series_id: row.id,
        title: row.title,
        year_start: row.year_start_cached,
        publisher: row.resolved_publisher_cached,
      } : null;
    }).filter(Boolean).sort((left, right) => left.title.localeCompare(right.title, undefined, { numeric: true }));

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const since = new Date(now.getTime() - (42 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);

    // Query 3: recent covers, paginated because an active 200-series list can
    // cross PostgREST's silent 1,000-row response cap.
    const coverPages = [];
    for (const group of chunks(seriesIds)) {
      coverPages.push(...await paged(() => supabase.from("canonical_covers")
        .select("id,gcd_issue_id,series_gcd_id,issue_number,publisher,storage_path,in_store_date")
        .in("series_gcd_id", group)
        .gte("in_store_date", since)
        .lte("in_store_date", today)
        .order("id", { ascending: true })));
    }
    const covers = dedupePullListCovers(coverPages);

    // Query 4: resolve the many covers that do not carry gcd_issue_id. Both
    // filters are broad, then matchIssue performs the exact pair comparison.
    // A null gcd_issue_id is Number(null) === 0, which is finite; test > 0.
    const unresolved = covers.filter((row) => !(Number(row.gcd_issue_id) > 0));
    const resolutionRows = [];
    const numbers = [...new Set(unresolved.flatMap((row) => {
      const raw = String(row.issue_number ?? "").trim();
      const normalized = issueKey(raw);
      return [raw, normalized.raw, normalized.reduced].filter(Boolean);
    }))];
    // issueNumberOrFilter also fetches GCD's legacy form ("40 (340)" for a
    // ComicVine "40"); 25 numbers per query keeps the URL short.
    for (const seriesGroup of chunks([...new Set(unresolved.map((row) => Number(row.series_gcd_id)))])) {
      for (const numberGroup of chunks(numbers, 25)) {
        const filter = issueNumberOrFilter(numberGroup);
        if (!filter) continue;
        const { data, error } = await supabase.from("gcd_issues")
          .select("gcd_id,series_gcd_id,issue_number")
          .in("series_gcd_id", seriesGroup)
          .or(filter)
          .is("variant_of_gcd_id", null);
        if (error) throw error;
        resolutionRows.push(...(data ?? []));
      }
    }
    const resolved = resolvePullListIssues(covers, resolutionRows);
    const resolvedIds = [...new Set(resolved.map((row) => row.gcd_issue_id).filter((id) => Number(id) > 0))];

    // Queries 5 and 6: issues cover-dated this month or later, then their
    // GCD on-sale dates. Only an exact future on-sale day counts as coming
    // soon (buildPullListUpcoming); cover months run about two months ahead
    // of the shops.
    const window = pullListMonthWindow(now);
    const upcomingRows = [];
    for (const group of chunks(seriesIds)) {
      const { data, error } = await supabase.from("gcd_issues")
        .select("gcd_id,series_gcd_id,issue_number,key_date")
        .in("series_gcd_id", group)
        .gte("key_date", `${window.startMonth}-00`)
        .is("variant_of_gcd_id", null)
        .limit(1000);
      if (error) throw error;
      upcomingRows.push(...(data ?? []));
    }
    const onSaleById = new Map();
    for (const group of chunks(upcomingRows.map((row) => row.gcd_id))) {
      const { data, error } = await supabase.from("gcd_issue_details")
        .select("gcd_issue_id,on_sale_date")
        .in("gcd_issue_id", group);
      if (error) throw error;
      for (const row of data ?? []) onSaleById.set(Number(row.gcd_issue_id), row.on_sale_date);
    }

    // Query 7: the viewer's status for every resolved recent issue.
    const collectionRows = [];
    for (const group of chunks(resolvedIds)) {
      const { data, error } = await supabase.from("user_collections")
        .select("gcd_issue_id,status")
        .eq("user_id", user.id)
        .in("gcd_issue_id", group);
      if (error) throw error;
      collectionRows.push(...(data ?? []));
    }
    const statuses = new Map();
    for (const row of collectionRows) {
      const id = Number(row.gcd_issue_id);
      if (!statuses.has(id)) statuses.set(id, new Set());
      statuses.get(id).add(row.status);
    }

    const items = resolved.map((row) => {
      const owner = seriesByGcd.get(Number(row.series_gcd_id));
      const issueStatuses = statuses.get(Number(row.gcd_issue_id)) ?? new Set();
      return {
        key: `${row.series_gcd_id}:${row.issue_number}`,
        series_gcd_id: Number(row.series_gcd_id),
        series_id: owner?.id ?? null,
        series_title: owner?.title ?? "Unknown series",
        issue_number: row.issue_number,
        publisher: owner?.resolved_publisher_cached ?? row.publisher ?? null,
        cover_url: coverThumb(canonicalCoverUrl(row.storage_path)),
        in_store_date: row.in_store_date,
        gcd_issue_id: Number(row.gcd_issue_id) > 0 ? Number(row.gcd_issue_id) : null,
        owned: issueStatuses.has("owned") || issueStatuses.has("for_sale"),
        wanted: issueStatuses.has("wishlist"),
      };
    });
    const upcoming = buildPullListUpcoming(upcomingRows.map((row) => ({
      ...row,
      on_sale_date: onSaleById.get(Number(row.gcd_id)) ?? null,
      series_title: seriesByGcd.get(Number(row.series_gcd_id))?.title ?? "Unknown series",
    })), items, now);
    return NextResponse.json({ series, weeks: groupPullListWeeks(items), upcoming });
  } catch (error) {
    return serverError(error, "Could not load your pull list.");
  }
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to follow a series." }, { status: 401 });
  const seriesGcdId = await parseSeriesId(req);
  if (!seriesGcdId) return NextResponse.json({ error: "Choose a valid series." }, { status: 400 });
  const supabase = getServiceClient();
  const [{ data: existing, error: existingError }, { count, error: countError }, { data: known, error: knownError }] = await Promise.all([
    supabase.from("pull_list_series").select("series_gcd_id").eq("user_id", user.id).eq("series_gcd_id", seriesGcdId).maybeSingle(),
    supabase.from("pull_list_series").select("series_gcd_id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("gcd_series").select("gcd_id").eq("gcd_id", seriesGcdId).maybeSingle(),
  ]);
  if (existingError || countError || knownError) return serverError(existingError || countError || knownError, "Could not update your pull list.");
  if (existing) return NextResponse.json({ following: true });
  if (!known) return NextResponse.json({ error: "That series is not in the catalog." }, { status: 404 });
  if ((count ?? 0) >= FOLLOW_CAP) return NextResponse.json({ error: `A pull list can follow up to ${FOLLOW_CAP} series.` }, { status: 409 });
  const { error } = await supabase.from("pull_list_series").insert({ user_id: user.id, series_gcd_id: seriesGcdId });
  if (error && error.code !== "23505") return serverError(error, "Could not add that series to your pull list.");
  return NextResponse.json({ following: true });
}

export async function DELETE(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to update your pull list." }, { status: 401 });
  const seriesGcdId = await parseSeriesId(req);
  if (!seriesGcdId) return NextResponse.json({ error: "Choose a valid series." }, { status: 400 });
  const { error } = await getServiceClient().from("pull_list_series")
    .delete()
    .eq("user_id", user.id)
    .eq("series_gcd_id", seriesGcdId);
  if (error) return serverError(error, "Could not remove that series from your pull list.");
  return NextResponse.json({ following: false });
}
