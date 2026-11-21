import { coverThumb } from "./coverThumb.js";
import { issueNumberSuffix } from "./issueNumberLabel.js";
import { canViewList } from "./lists.js";
import { getServiceClient } from "./supabase/service.js";
import { bestYearFor } from "./years.js";

const CHUNK_SIZE = 200;
const PAGE_SIZE = 1000;

function publicCoverUrl(path) {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}`;
}

async function hydrateIssues(db, ids) {
  const uniqueIds = [...new Set(ids.map(Number).filter(Number.isInteger))];
  const issues = [];
  const seriesRows = [];
  const coverRows = [];

  for (let index = 0; index < uniqueIds.length; index += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + CHUNK_SIZE);
    const { data, error } = await db
      .from("gcd_issues")
      .select("gcd_id,series_gcd_id,issue_number,key_date,publication_date")
      .in("gcd_id", chunk)
      .range(0, CHUNK_SIZE - 1);

    if (error) throw error;
    issues.push(...(data ?? []));
  }

  const seriesIds = [
    ...new Set(
      issues.map((row) => Number(row.series_gcd_id)).filter(Number.isInteger)
    ),
  ];

  for (let index = 0; index < seriesIds.length; index += CHUNK_SIZE) {
    const chunk = seriesIds.slice(index, index + CHUNK_SIZE);
    const { data, error } = await db
      .from("series")
      .select("gcd_id,title")
      .in("gcd_id", chunk)
      .range(0, CHUNK_SIZE - 1);

    if (error) throw error;
    seriesRows.push(...(data ?? []));
  }

  for (let index = 0; index < uniqueIds.length; index += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + CHUNK_SIZE);
    const { data, error } = await db
      .from("canonical_covers")
      .select("gcd_issue_id,storage_path")
      .in("gcd_issue_id", chunk)
      .range(0, CHUNK_SIZE - 1);

    if (error) throw error;
    coverRows.push(...(data ?? []));
  }

  const seriesById = new Map(
    seriesRows.map((row) => [Number(row.gcd_id), row])
  );
  const coverByIssue = new Map(
    coverRows
      .filter((row) => row.storage_path)
      .map((row) => [Number(row.gcd_issue_id), row.storage_path])
  );

  return new Map(
    issues.map((row) => {
      const title =
        seriesById.get(Number(row.series_gcd_id))?.title || "Untitled";
      const issueId = Number(row.gcd_id);

      return [
        issueId,
        {
          base_gcd_issue_id: issueId,
          series_title: title,
          issue_number: row.issue_number,
          title: `${title}${issueNumberSuffix(row.issue_number)}`,
          year: bestYearFor(row),
          cover: coverThumb(publicCoverUrl(coverByIssue.get(issueId))),
          href: `/issue/gcd-${issueId}`,
        },
      ];
    })
  );
}

async function loadAllListItems(db, listIds) {
  if (!listIds.length) return [];

  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("collector_list_items")
      .select("list_id,base_gcd_issue_id,position")
      .in("list_id", listIds)
      .order("position")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }

  return rows;
}

async function attachCountsAndCovers(db, lists) {
  if (!lists.length) return [];

  const listIds = lists.map((row) => row.id);
  const rows = await loadAllListItems(db, listIds);
  const grouped = new Map(listIds.map((id) => [id, []]));

  for (const row of rows) {
    grouped.get(row.list_id)?.push(row);
  }

  const firstIssueIds = [
    ...new Set(
      [...grouped.values()].flatMap((items) =>
        items.slice(0, 4).map((item) => item.base_gcd_issue_id)
      )
    ),
  ];
  const displayByIssue = await hydrateIssues(db, firstIssueIds);

  return lists.map((list) => {
    const items = grouped.get(list.id) ?? [];
    return {
      ...list,
      item_count: items.length,
      covers: items
        .slice(0, 4)
        .map(
          (item) =>
            displayByIssue.get(Number(item.base_gcd_issue_id))?.cover
        )
        .filter(Boolean),
    };
  });
}

export async function getListPathRecord(username, slug) {
  const db = getServiceClient();
  const { data: owner, error: ownerError } = await db
    .from("profiles")
    .select("id,username,display_name,avatar_url,avatar_key,is_public")
    .eq("username", username)
    .maybeSingle();

  if (ownerError) throw ownerError;
  if (!owner) return null;

  const { data: list, error: listError } = await db
    .from("collector_lists")
    .select("*")
    .eq("user_id", owner.id)
    .eq("slug", slug)
    .maybeSingle();

  if (listError) throw listError;
  if (!list) return null;
  return { list, owner };
}

export async function getListPage(username, slug, viewerId = null) {
  const record = await getListPathRecord(username, slug);
  if (!record || !canViewList(record.list, record.owner, viewerId)) return null;

  const db = getServiceClient();
  const { data: rows, error } = await db
    .from("collector_list_items")
    .select("list_id,base_gcd_issue_id,position,note,added_at")
    .eq("list_id", record.list.id)
    .order("position")
    .range(0, 499);

  if (error) throw error;

  const displayByIssue = await hydrateIssues(
    db,
    (rows ?? []).map((row) => row.base_gcd_issue_id)
  );

  return {
    ...record,
    items: (rows ?? []).map((row) => ({
      ...row,
      ...displayByIssue.get(Number(row.base_gcd_issue_id)),
    })),
  };
}

export async function getUserLists(userId, { includePrivate = false } = {}) {
  const db = getServiceClient();
  let query = db
    .from("collector_lists")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(0, 99);

  if (!includePrivate) query = query.eq("is_public", true);

  const { data, error } = await query;
  if (error) throw error;
  return attachCountsAndCovers(db, data ?? []);
}

export async function getRecentPublicLists({ limit = 24 } = {}) {
  const db = getServiceClient();
  const { data: lists, error } = await db
    .from("collector_lists")
    .select("*")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .range(0, Math.max(limit * 4, 24) - 1);

  if (error) throw error;

  const userIds = [...new Set((lists ?? []).map((row) => row.user_id))];
  const ownerResult = userIds.length
    ? await db
        .from("profiles")
        .select("id,username,avatar_url,avatar_key,is_public")
        .in("id", userIds)
    : { data: [], error: null };

  if (ownerResult.error) throw ownerResult.error;

  const ownerById = new Map(
    (ownerResult.data ?? [])
      .filter((profile) => profile.username && profile.is_public !== false)
      .map((profile) => [profile.id, profile])
  );
  const visibleLists = (lists ?? []).filter((list) =>
    ownerById.has(list.user_id)
  );
  const hydrated = await attachCountsAndCovers(db, visibleLists);

  return hydrated
    .filter((list) => list.item_count >= 3)
    .slice(0, limit)
    .map((list) => ({ ...list, owner: ownerById.get(list.user_id) }));
}

export async function getListsContaining(baseGcdId, { limit = 6 } = {}) {
  const db = getServiceClient();
  const { data: matches, error } = await db
    .from("collector_list_items")
    .select("list_id")
    .eq("base_gcd_issue_id", Number(baseGcdId))
    .range(0, 99);

  if (error) throw error;

  const listIds = (matches ?? []).map((row) => row.list_id);
  if (!listIds.length) return [];

  const { data: lists, error: listError } = await db
    .from("collector_lists")
    .select("*")
    .in("id", listIds)
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .range(0, 99);

  if (listError) throw listError;

  const withDetails = await attachCountsAndCovers(db, lists ?? []);
  const userIds = [...new Set(withDetails.map((row) => row.user_id))];
  const { data: owners, error: ownerError } = await db
    .from("profiles")
    .select("id,username,avatar_url,avatar_key,is_public")
    .in("id", userIds);

  if (ownerError) throw ownerError;

  const ownerById = new Map(
    (owners ?? [])
      .filter((profile) => profile.username && profile.is_public !== false)
      .map((profile) => [profile.id, profile])
  );

  return withDetails
    .filter((list) => ownerById.has(list.user_id))
    .slice(0, limit)
    .map((list) => ({ ...list, owner: ownerById.get(list.user_id) }));
}
