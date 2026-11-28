// Repoint collection rows from approved member-added comics to their verified
// GCD issues. Dry run by default.
//
//   node scripts/linkComicsToGcd.js
//   node scripts/linkComicsToGcd.js --apply

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { planComicCollectionLinks } from "./lib/linkComicsToGcd.js";

dotenv.config({ path: ".env.local", quiet: true });

const args = process.argv.slice(2);
const unknown = args.filter((arg) => arg !== "--apply");
if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
const APPLY = args.includes("--apply");

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function queryRows(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

async function selectInChunks(values, load, size = 100) {
  const unique = [...new Set(values.filter((value) => value != null))];
  const rows = [];
  for (let index = 0; index < unique.length; index += size) {
    rows.push(...await load(unique.slice(index, index + size)));
  }
  return rows;
}

async function loadPlan(supabase) {
  const comics = await queryRows("approved comics", supabase
    .from("comics")
    .select("id,series_title,issue_number,publisher,release_year,review_status,gcd_id")
    .eq("review_status", "approved")
    .not("gcd_id", "is", null)
    .order("id")
    .limit(1000));
  if (!comics.length) return { changes: [], skips: [] };

  const comicIds = comics.map((comic) => comic.id);
  const collections = await selectInChunks(comicIds, (ids) => queryRows("collection rows", supabase
    .from("user_collections")
    .select("id,user_id,comic_id,gcd_issue_id,status,condition,grade_numeric,slab_company,slab_cert_number,variant_label,user_cover_url")
    .in("comic_id", ids)
    .order("id")
    .limit(1000)));
  if (!collections.length) return { changes: [], skips: [] };

  const userIds = collections.map((row) => row.user_id);
  const targetIds = comics.map((comic) => Number(comic.gcd_id)).filter(Number.isInteger);
  const referencedComicIds = collections.map((row) => row.comic_id);

  const [gcdIssues, profiles, covers, existingLinks, listings] = await Promise.all([
    selectInChunks(targetIds, (ids) => queryRows("GCD issues", supabase
      .from("gcd_issues").select("gcd_id").in("gcd_id", ids).limit(1000))),
    selectInChunks(userIds, (ids) => queryRows("profiles", supabase
      .from("profiles").select("id,username").in("id", ids).limit(1000))),
    selectInChunks(referencedComicIds, (ids) => queryRows("comic covers", supabase
      .from("comic_covers").select("comic_id,image_path,is_primary,created_at").in("comic_id", ids).limit(1000))),
    selectInChunks(userIds, (ids) => queryRows("existing GCD collection links", supabase
      .from("user_collections")
      .select("id,user_id,gcd_issue_id")
      .in("user_id", ids)
      .in("gcd_issue_id", targetIds)
      .limit(1000))),
    selectInChunks(collections.map((row) => row.id), (ids) => queryRows("collection listings", supabase
      .from("listings").select("id,collection_id").in("collection_id", ids).limit(1000))),
  ]);

  const orderItems = await selectInChunks(listings.map((listing) => listing.id), (ids) => queryRows("listing order items", supabase
    .from("order_items")
    .select("listing_id,order_id")
    .in("listing_id", ids)
    .limit(1000)));
  const openOrders = await selectInChunks(orderItems.map((item) => item.order_id), (ids) => queryRows("open orders", supabase
    .from("orders")
    .select("id,status")
    .in("id", ids)
    .in("status", ["created", "awaiting_payment", "paid"])
    .limit(1000)));
  const openOrderIds = new Set(openOrders.map((order) => order.id));
  const openListingIds = new Set(orderItems
    .filter((item) => openOrderIds.has(item.order_id))
    .map((item) => item.listing_id));
  const blockedCollectionIds = listings
    .filter((listing) => openListingIds.has(listing.id))
    .map((listing) => listing.collection_id);

  return planComicCollectionLinks({
    collections,
    comics,
    gcdIssues,
    profiles,
    covers,
    existingLinks,
    blockedCollectionIds,
  });
}

function printEntry(prefix, entry, suffix = "") {
  console.log(`${prefix} member=${entry.username} | book=${entry.book} | from=${entry.from} | to=${entry.to}${suffix}`);
}

async function main() {
  const supabase = client();
  const plan = await loadPlan(supabase);

  for (const entry of plan.changes) {
    printEntry(APPLY ? "CHANGE" : "[dry run] CHANGE", entry, entry.listingSync ? " | listing=trigger sync" : "");
  }
  for (const entry of plan.skips) printEntry("SKIP", entry, ` | reason=${entry.reason}`);

  if (!APPLY) {
    console.log(`Dry run complete: changes=${plan.changes.length}, skipped=${plan.skips.length}`);
    return;
  }

  let changed = 0;
  let failed = 0;
  for (const entry of plan.changes) {
    // This is the same narrow update shape as /api/library/catalog-link.
    // Existing grade and variant fields stay on user_collections, and the
    // user_collections_sync_listing trigger copies them to an active listing.
    const { data, error } = await supabase
      .from("user_collections")
      .update(entry.update)
      .eq("id", entry.collectionId)
      .eq("user_id", entry.userId)
      .eq("comic_id", entry.sourceComicId)
      .is("gcd_issue_id", null)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      failed += 1;
      printEntry("REFUSED", entry, ` | reason=${error?.message ?? "row changed after planning"}`);
      continue;
    }
    changed += 1;
  }
  console.log(`Apply complete: changed=${changed}, refused=${failed}, planned_skips=${plan.skips.length}`);
}

main().catch((error) => {
  console.error("linkComicsToGcd failed:", error.message);
  process.exitCode = 1;
});
