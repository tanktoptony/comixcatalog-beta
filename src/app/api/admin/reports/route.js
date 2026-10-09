import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { revalidateListings } from "@/lib/marketplace";
import { getServiceClient } from "@/lib/supabase/service";

async function hydrateReports(supabase, reports) {
  const reporterIds = [...new Set(reports.map((report) => report.reporter_id))];
  const listingIds = reports.filter((report) => report.target_type === "listing").map((report) => report.target_id);
  const userIds = reports.filter((report) => report.target_type === "user").map((report) => report.target_id);
  const messageIds = reports.filter((report) => report.target_type === "message").map((report) => report.target_id);
  const [reportersResult, listingsResult, usersResult, messagesResult] = await Promise.all([
    reporterIds.length ? supabase.from("profiles").select("id, username").in("id", reporterIds) : { data: [] },
    listingIds.length ? supabase.from("listings").select("id, series_title, issue_number, seller_id, status").in("id", listingIds) : { data: [] },
    userIds.length ? supabase.from("profiles").select("id, username").in("id", userIds) : { data: [] },
    messageIds.length ? supabase.from("messages").select("id, body, sender_id, recipient_id").in("id", messageIds) : { data: [] },
  ]);
  const firstError = [reportersResult, listingsResult, usersResult, messagesResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  const messages = messagesResult.data ?? [];
  const relatedProfileIds = [...new Set([...(listingsResult.data ?? []).map((row) => row.seller_id), ...messages.flatMap((row) => [row.sender_id, row.recipient_id])])];
  const relatedResult = relatedProfileIds.length ? await supabase.from("profiles").select("id, username").in("id", relatedProfileIds) : { data: [] };
  if (relatedResult.error) throw relatedResult.error;
  const names = new Map([...(reportersResult.data ?? []), ...(usersResult.data ?? []), ...(relatedResult.data ?? [])].map((row) => [row.id, row.username]));
  const listings = new Map((listingsResult.data ?? []).map((row) => [row.id, row]));
  const messageMap = new Map(messages.map((row) => [row.id, row]));
  return reports.map((report) => {
    let summary = "Target is no longer available";
    if (report.target_type === "listing") {
      const listing = listings.get(report.target_id);
      if (listing) summary = `${listing.series_title}${listing.issue_number ? ` #${listing.issue_number}` : ""} from @${names.get(listing.seller_id) || "unknown"} (${listing.status})`;
    } else if (report.target_type === "user") {
      summary = `@${names.get(report.target_id) || "unknown"}`;
    } else if (report.target_type === "message") {
      const message = messageMap.get(report.target_id);
      if (message) summary = `@${names.get(message.sender_id) || "unknown"} to @${names.get(message.recipient_id) || "unknown"}: ${message.body}`;
    } else {
      summary = `Photo ${report.target_id}`;
    }
    return { ...report, reporter_username: names.get(report.reporter_id) || "unknown", summary };
  });
}

export async function GET(req) {
  const { response } = await requireAdmin(req);
  if (response) return response;
  const supabase = getServiceClient();
  try {
    const [openResult, closedResult] = await Promise.all([
      supabase.from("reports").select("*").eq("status", "open").order("created_at", { ascending: false }),
      supabase.from("reports").select("*").in("status", ["actioned", "dismissed"]).order("created_at", { ascending: false }).limit(50),
    ]);
    if (openResult.error) throw openResult.error;
    if (closedResult.error) throw closedResult.error;
    return NextResponse.json({ reports: await hydrateReports(supabase, [...(openResult.data ?? []), ...(closedResult.data ?? [])]) });
  } catch (error) {
    console.error("GET /api/admin/reports failed:", error);
    return NextResponse.json({ error: "Could not load reports." }, { status: 500 });
  }
}

export async function POST(req) {
  const { response } = await requireAdmin(req);
  if (response) return response;
  const body = await req.json().catch(() => null);
  if (!body?.id || !["dismiss", "action", "remove_listing"].includes(body.action)) return NextResponse.json({ error: "Invalid report action." }, { status: 400 });
  const supabase = getServiceClient();
  try {
    const { data: report, error: lookupError } = await supabase.from("reports").select("id, target_type, target_id, status").eq("id", body.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (body.action === "remove_listing") {
      if (report.target_type !== "listing") return NextResponse.json({ error: "This report is not for a listing." }, { status: 400 });
      const { data: listing, error: listingError } = await supabase.from("listings").update({ status: "removed", updated_at: new Date().toISOString() }).eq("id", report.target_id).select("id, collection_id").maybeSingle();
      if (listingError) throw listingError;
      if (!listing) return NextResponse.json({ error: "Listing not found." }, { status: 404 });
      // Put the book back to plain "owned" so the seller's library doesn't
      // keep showing it for sale. Re-listing then takes a deliberate step,
      // which makes a fresh listing (the trigger ignores removed rows).
      const { error: collectionError } = await supabase.from("user_collections").update({ status: "owned" }).eq("id", listing.collection_id).eq("status", "for_sale");
      if (collectionError) throw collectionError;
    }
    const status = body.action === "dismiss" ? "dismissed" : "actioned";
    const { data: saved, error } = await supabase.from("reports").update({ status }).eq("id", report.id).select("id").maybeSingle();
    if (error) throw error;
    if (!saved) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (body.action === "remove_listing") revalidateListings();
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("POST /api/admin/reports failed:", error);
    return NextResponse.json({ error: "Could not update report." }, { status: 500 });
  }
}
