import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { resolveCovers } from "@/lib/catalog/covers";
import { reviewActionToUpdate } from "@/lib/review";
import { getServiceClient } from "@/lib/supabase/service";

const publicCanonicalCover = (path) => path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}` : null;
const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export async function GET(req) {
  const { admin: user, response } = await requireAdmin(req);
  if (response) return response;
  const kind = new URL(req.url).searchParams.get("kind");
  if (!new Set(["printings", "books"]).has(kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  const supabase = getServiceClient();
  const [printingCount, bookCount] = await Promise.all([
    supabase.from("issue_printings").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("comics").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
  ]);
  let items = [];
  if (kind === "printings") {
    const { data, error } = await supabase.from("issue_printings")
      .select("id, gcd_issue_id, kind, printing_name, upc, submitted_by, created_at, photo_path")
      .eq("status", "pending").order("created_at", { ascending: true }).limit(50);
    if (error) return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });
    const issueIds = [...new Set((data ?? []).map((row) => row.gcd_issue_id))];
    const { data: issues } = issueIds.length ? await supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("gcd_id", issueIds) : { data: [] };
    const seriesIds = [...new Set((issues ?? []).map((row) => row.series_gcd_id).filter(Boolean))];
    const { data: series } = seriesIds.length ? await supabase.from("series").select("gcd_id, title, year_start_cached, year_end_cached, resolved_publisher_cached").in("gcd_id", seriesIds) : { data: [] };
    const seriesMap = new Map((series ?? []).map((row) => [String(row.gcd_id), row]));
    const issueMap = new Map((issues ?? []).map((row) => [String(row.gcd_id), row]));
    const coverInputs = (issues ?? []).map((issue) => { const s = seriesMap.get(String(issue.series_gcd_id)) ?? {}; return { gcd_issue_id: issue.gcd_id, series_gcd_id: issue.series_gcd_id, series_title: s.title, issue_number: issue.issue_number, year: Number(String(issue.key_date ?? issue.publication_date ?? "").slice(0, 4)) || null, series_year_start: s.year_start_cached, series_year_end: s.year_end_cached, publisher: s.resolved_publisher_cached }; });
    const covers = await resolveCovers(supabase, coverInputs);
    const submitterIds = [...new Set((data ?? []).map((row) => row.submitted_by).filter(Boolean))];
    const { data: profiles } = submitterIds.length ? await supabase.from("profiles").select("id, username").in("id", submitterIds) : { data: [] };
    const names = new Map((profiles ?? []).map((row) => [row.id, row.username]));
    items = await Promise.all((data ?? []).map(async (row) => {
      const issue = issueMap.get(String(row.gcd_issue_id)) ?? {}; const s = seriesMap.get(String(issue.series_gcd_id)) ?? {};
      const signed = row.photo_path ? await supabase.storage.from("cover-scans").createSignedUrl(row.photo_path, 600) : { data: null };
      return { ...row, series_title: s.title, issue_number: issue.issue_number, year: Number(String(issue.key_date ?? issue.publication_date ?? "").slice(0, 4)) || null, submitter: names.get(row.submitted_by) ?? "Unknown", photo_url: signed.data?.signedUrl ?? null, current_cover_url: publicCanonicalCover(covers.get(row.gcd_issue_id)?.storage_path) };
    }));
  } else {
    const { data, error } = await supabase.from("comics").select("id, series_title, issue_number, publisher, release_year, variant_name, created_by, created_at").eq("review_status", "pending").order("created_at", { ascending: true }).limit(50);
    if (error) return NextResponse.json({ error: "Could not load reviews." }, { status: 500 });
    const submitterIds = [...new Set((data ?? []).map((row) => row.created_by).filter(Boolean))];
    const titles = [...new Set((data ?? []).map((row) => normalize(row.series_title)).filter(Boolean))];
    const [profilesResult, matchesResult] = await Promise.all([
      submitterIds.length ? supabase.from("profiles").select("id, username").in("id", submitterIds) : Promise.resolve({ data: [] }),
      titles.length ? supabase.from("series").select("gcd_id, title, title_normalized").in("title_normalized", titles).not("gcd_id", "is", null).limit(200) : Promise.resolve({ data: [] }),
    ]);
    const names = new Map((profilesResult.data ?? []).map((row) => [row.id, row.username]));
    const candidates = matchesResult.data ?? [];
    items = (data ?? []).map((row) => ({ ...row, submitter: names.get(row.created_by) ?? "Unknown", possible_match: candidates.find((match) => normalize(match.title) === normalize(row.series_title)) ? `${candidates.find((match) => normalize(match.title) === normalize(row.series_title)).title} #${row.issue_number}` : null }));
  }
  return NextResponse.json({ items, counts: { printings: printingCount.count ?? 0, books: bookCount.count ?? 0 } });
}

export async function POST(req) {
  const { admin: user, response } = await requireAdmin(req);
  if (response) return response;
  const body = await req.json().catch(() => null);
  const update = reviewActionToUpdate(body?.kind, body?.action, body?.note, user.id);
  if (!body?.id || !update) return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
  const supabase = getServiceClient();
  if (body.kind === "printings" && body.action === "approve") {
    const { data: printing, error: lookupError } = await supabase.from("issue_printings").select("photo_path").eq("id", body.id).eq("status", "pending").maybeSingle();
    if (lookupError) { console.error("admin review printing lookup failed", lookupError); return NextResponse.json({ error: "Could not load that submission." }, { status: 500 }); }
    if (!printing) return NextResponse.json({ error: "That submission is no longer pending." }, { status: 404 });
    // Printings reported from the issue page carry no photo; those approve
    // without a cover. Scan submissions publish their photo as the cover.
    if (printing.photo_path) {
      const { data: photo, error: downloadError } = await supabase.storage.from("cover-scans").download(printing.photo_path);
      if (downloadError || !photo) return NextResponse.json({ error: "Could not read submission photo." }, { status: 500 });
      const path = `printings/${body.id}.jpg`;
      const { error: uploadError } = await supabase.storage.from("comic-covers").upload(path, photo, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) return NextResponse.json({ error: "Could not publish cover." }, { status: 500 });
      update.cover_url = supabase.storage.from("comic-covers").getPublicUrl(path).data.publicUrl;
    }
  }
  const table = body.kind === "printings" ? "issue_printings" : "comics";
  const pendingColumn = body.kind === "printings" ? "status" : "review_status";
  const { data: saved, error } = await supabase.from(table).update(update).eq("id", body.id).eq(pendingColumn, "pending").select("id");
  if (error) { console.error("admin review save failed", error); return NextResponse.json({ error: "Could not save review." }, { status: 500 }); }
  if (!saved?.length) return NextResponse.json({ error: "That submission is no longer pending." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
