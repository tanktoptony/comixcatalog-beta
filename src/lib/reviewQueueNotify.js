// Site notifications for the review queue (migration 0118).
//
// Tony gets ONE unread "review_queue" notification that stays current: every
// new book request, printing report or user-added book rewrites its label
// with the live counts and bumps it to the top of his inbox, so a batch of 20
// import requests is one line, not 20. Resolving items updates the counts and
// clears it once the queue is empty. It shows in the header inbox badge, the
// chat dock and /inbox, and is never emailed (emailed_at is set on insert).
//
// The person who asked for a book gets a "request_done" notification when
// it's in the catalog, linking to the issue.
//
// Relative imports only: scripts/generateRequestedGap.js uses this too.
// Nothing here throws; a notification failure never fails the request.

import { ADMIN_ID } from "./admin.js";

const REVIEW_URL = "/admin/review";

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

export function reviewQueueLabel({ requests = 0, printings = 0, books = 0 } = {}) {
  const parts = [];
  if (requests) parts.push(plural(requests, "book request", "book requests"));
  if (printings) parts.push(plural(printings, "printing report", "printing reports"));
  if (books) parts.push(plural(books, "user-added book", "user-added books"));
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `${list} waiting for review`;
}

// The tab with the newest work, so the link lands where the new item is.
export function reviewQueueUrl(tab) {
  return tab ? `${REVIEW_URL}?tab=${tab}` : REVIEW_URL;
}

async function queueCounts(db) {
  const [requests, printings, books] = await Promise.all([
    db.from("catalog_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("issue_printings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("comics").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
  ]);
  const failed = requests.error || printings.error || books.error;
  if (failed) throw new Error(`review queue count failed: ${failed.message}`);
  return { requests: requests.count ?? 0, printings: printings.count ?? 0, books: books.count ?? 0 };
}

async function unreadQueueNotification(db) {
  const { data, error } = await db.from("notifications").select("id")
    .eq("user_id", ADMIN_ID).eq("kind", "review_queue").is("read_at", null)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(`review queue notification read failed: ${error.message}`);
  return data?.[0] ?? null;
}

// Call after something lands in the queue. `excerpt` says what just arrived
// ("1 Month 2 Live #3"); `tab` is requests | printings | books.
export async function notifyReviewQueue(db, { actorId = null, excerpt = null, tab = null } = {}) {
  try {
    if (actorId === ADMIN_ID) return;
    const label = reviewQueueLabel(await queueCounts(db));
    if (!label) return;
    const row = {
      actor_id: actorId,
      url: reviewQueueUrl(tab),
      label,
      excerpt: excerpt ? String(excerpt).slice(0, 200) : null,
      created_at: new Date().toISOString(),
    };
    const existing = await unreadQueueNotification(db);
    const { error } = existing
      ? await db.from("notifications").update(row).eq("id", existing.id)
      : await db.from("notifications").insert({ ...row, user_id: ADMIN_ID, kind: "review_queue", emailed_at: row.created_at });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("review queue notification failed:", error?.message ?? error);
  }
}

// Call after Tony resolves something: keeps the unread line's counts honest
// and marks it read when nothing is left. Never creates a new one.
export async function refreshReviewQueue(db) {
  try {
    const existing = await unreadQueueNotification(db);
    if (!existing) return;
    const label = reviewQueueLabel(await queueCounts(db));
    const { error } = label
      ? await db.from("notifications").update({ label }).eq("id", existing.id)
      : await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("review queue refresh failed:", error?.message ?? error);
  }
}

export function issueLabel({ seriesName, seriesYear, issueNumber, variantName }) {
  const series = seriesYear ? `${seriesName} (${seriesYear})` : seriesName;
  const issue = String(issueNumber ?? "").trim();
  const number = issue && !issue.startsWith("[") ? ` #${issue}` : issue ? ` ${issue}` : "";
  const variant = variantName ? `, ${variantName}` : "";
  return `${series}${number}${variant}`.slice(0, 300);
}

// Tells the requester their book is in the catalog. `request` needs id and
// user_id; the label is built from the catalog's own issue row.
export async function notifyRequestDone(db, request, gcdIssueId) {
  try {
    const issueId = Number(gcdIssueId);
    if (!request?.user_id || !Number.isInteger(issueId)) return;
    const { data: issue, error: issueError } = await db.from("gcd_issues")
      .select("gcd_id, issue_number, variant_name, series_gcd_id").eq("gcd_id", issueId).maybeSingle();
    if (issueError || !issue) throw new Error(issueError?.message ?? `issue ${issueId} not found`);
    const { data: series, error: seriesError } = await db.from("gcd_series")
      .select("name, year_began").eq("gcd_id", issue.series_gcd_id).maybeSingle();
    if (seriesError) throw new Error(seriesError.message);
    const label = issueLabel({
      seriesName: series?.name ?? "Your book",
      seriesYear: series?.year_began,
      issueNumber: issue.issue_number,
      variantName: issue.variant_name,
    });
    const { error } = await db.from("notifications").insert({
      user_id: request.user_id,
      actor_id: null,
      kind: "request_done",
      url: `/issue/gcd-${issueId}`,
      label,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("request done notification failed:", error?.message ?? error);
  }
}
