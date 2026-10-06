import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { ADMIN_ID } from "@/lib/admin";
import { US_PUBLISHER_ALLOWLIST } from "@/lib/publisher";
import { normalizeSeriesSearchWords } from "@/lib/seriesSearchMatch";
import { baseIssueNumber } from "@/lib/coverMatch";
import { capStatus, collapseCoverPrintings, coverScanConfigStatus, coverScanModelFailure, coverScanOutcome, COVER_SCAN_MODEL, rankCoverCandidates, titleTokens } from "@/lib/coverScan";
import { extractCover } from "@/lib/coverScanClaude";
import { resolveCovers } from "@/lib/catalog/covers";

export const runtime = "nodejs";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const publicCover = (path) => path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/canonical-covers/${path}` : null;

async function quota(supabase, userId, isPro) {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase.from("cover_scans").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", start.toISOString()).not("outcome", "in", '("capped","error")');
  if (error) throw error;
  return capStatus(count ?? 0, isPro);
}

async function findCandidates(supabase, extracted) {
  const term = normalizeSeriesSearchWords(extracted.series_title);
  const directTokens = titleTokens(extracted.series_title).filter((token) => token.length > 1).slice(0, 8);
  let directQuery = supabase.from("gcd_series")
    .select("gcd_id, name, year_began, year_ended, gcd_publishers!inner(name)")
    .in("gcd_publishers.name", US_PUBLISHER_ALLOWLIST)
    .limit(50);
  for (const token of directTokens) directQuery = directQuery.ilike("name", `%${token}%`);
  const [{ data: seriesRows, error: seriesError }, { data: gcdSeriesRows, error: gcdSeriesError }] = await Promise.all([
    supabase.rpc("search_series_by_relevance", { normalized_term: term, allowed_publishers: US_PUBLISHER_ALLOWLIST, result_limit: 1000 }),
    directTokens.length ? directQuery : Promise.resolve({ data: [], error: null }),
  ]);
  if (seriesError) throw seriesError;
  if (gcdSeriesError) throw gcdSeriesError;
  const seriesById = new Map((seriesRows ?? []).slice(0, 100).map((row) => [Number(row.gcd_id), row]));
  for (const row of gcdSeriesRows ?? []) {
    const id = Number(row.gcd_id);
    if (!seriesById.has(id)) seriesById.set(id, {
      gcd_id: id,
      title: row.name,
      year_start_cached: row.year_began,
      year_end_cached: row.year_ended,
      resolved_publisher_cached: row.gcd_publishers?.name ?? null,
    });
  }
  const series = [...seriesById.values()];
  const ids = series.map((s) => Number(s.gcd_id)).filter(Number.isFinite);
  if (!ids.length) return [];
  const base = baseIssueNumber(extracted.issue_number);
  if (!base) return [];
  const { data: issues, error: issueError } = await supabase.from("gcd_issues")
    .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
    .in("series_gcd_id", ids).ilike("issue_number", `${base}%`).order("gcd_id", { ascending: true }).limit(1000);
  if (issueError) throw issueError;
  const ranked = rankCoverCandidates(extracted, series, issues ?? []);
  const coverInputs = ranked.map(({ issue, series: s }) => ({
    gcd_issue_id: Number(issue.gcd_id), series_gcd_id: Number(issue.series_gcd_id),
    series_title: s.title, issue_number: issue.issue_number,
    year: Number(String(issue.key_date ?? issue.publication_date ?? "").match(/\b(\d{4})\b/)?.[1]) || null,
    series_year_start: s.year_start_cached ?? null, series_year_end: s.year_end_cached ?? null,
  }));
  const covers = await resolveCovers(supabase, coverInputs);
  const distinct = collapseCoverPrintings(ranked, covers).slice(0, 3);
  return distinct.map(({ issue, series: s }) => ({
    id: `gcd-${issue.gcd_id}`, gcd_issue_id: Number(issue.gcd_id), series_title: s.title,
    issue_number: issue.issue_number, year: Number(String(issue.key_date ?? issue.publication_date ?? "").match(/\b(\d{4})\b/)?.[1]) || null,
    publisher: s.resolved_publisher_cached ?? null, cover_path: publicCover(covers.get(Number(issue.gcd_id))?.storage_path), __source: "gcd",
  }));
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to scan a cover." }, { status: 401 });
  const supabase = getServiceClient();
  const { data: profile, error: profileError } = await supabase.from("profiles").select("is_pro").eq("id", user.id).single();
  if (profileError) return NextResponse.json({ error: "Could not check your scan limit." }, { status: 503 });
  const isPro = Boolean(profile?.is_pro) || user.id === ADMIN_ID;
  let current;
  try { current = await quota(supabase, user.id, isPro); } catch (error) { console.error("cover scan quota failed", error); return NextResponse.json({ error: "Could not check your scan limit." }, { status: 503 }); }
  if (!current.allowed) {
    const { error: cappedError } = await supabase.from("cover_scans").insert({ user_id: user.id, outcome: "capped" });
    if (cappedError) console.error("cover scan capped log failed", cappedError);
    const resetAt = new Date(); resetAt.setUTCDate(resetAt.getUTCDate() + 1); resetAt.setUTCHours(0, 0, 0, 0);
    return NextResponse.json({ error: "You have used today’s cover scans. Try again after the daily reset.", reset_at: resetAt.toISOString(), quota: current }, { status: 429 });
  }
  const unavailable = coverScanConfigStatus();
  if (unavailable) { console.error("POST /api/cover-scan: missing ANTHROPIC_API_KEY"); return NextResponse.json({ error: unavailable.error }, { status: unavailable.status }); }
  const form = await req.formData();
  const image = form.get("image");
  if (!(image instanceof File) || !IMAGE_TYPES.has(image.type)) return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP image." }, { status: 415 });
  if (!image.size || image.size >= MAX_IMAGE_BYTES) return NextResponse.json({ error: "That image is too large. Please choose one under 4 MB." }, { status: 413 });
  const scanId = crypto.randomUUID();
  const storagePath = `${user.id}/${scanId}.jpg`;
  let uploaded = false;
  try {
    const bytes = Buffer.from(await image.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from("cover-scans").upload(storagePath, bytes, { contentType: image.type, upsert: false });
    if (uploadError) throw uploadError;
    uploaded = true;
    const { extracted, usage } = await extractCover(bytes.toString("base64"), image.type);
    const candidates = extracted.is_comic_cover ? await findCandidates(supabase, extracted) : [];
    const outcome = coverScanOutcome(extracted, candidates);
    const { error: insertError } = await supabase.from("cover_scans").insert({ id: scanId, user_id: user.id, storage_path: storagePath, model: COVER_SCAN_MODEL, extracted, candidates, outcome, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null });
    if (insertError) throw insertError;
    const nextQuota = capStatus(current.used + 1, isPro);
    return NextResponse.json({ scan_id: scanId, outcome, extracted, candidates, quota: nextQuota });
  } catch (error) {
    console.error("POST /api/cover-scan failed", error);
    const failure = error?.status === 503
      ? { status: 503, outcome: "error", error: "Cover scanning is temporarily unavailable." }
      : coverScanModelFailure();
    const { error: logError } = await supabase.from("cover_scans").insert({ id: scanId, user_id: user.id, storage_path: uploaded ? storagePath : null, model: COVER_SCAN_MODEL, outcome: "error" });
    if (logError) console.error("cover scan error log failed", logError);
    return NextResponse.json({ error: failure.error, outcome: failure.outcome }, { status: failure.status });
  }
}

export async function PATCH(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.scan_id || !Number.isInteger(Number(body.gcd_issue_id))) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  const supabase = getServiceClient();
  const { data: scan, error: scanError } = await supabase.from("cover_scans").select("id, candidates").eq("id", body.scan_id).eq("user_id", user.id).maybeSingle();
  if (scanError) { console.error("PATCH /api/cover-scan lookup failed", scanError); return NextResponse.json({ error: "Could not record selection" }, { status: 500 }); }
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  if (!(scan.candidates ?? []).some((row) => Number(row.gcd_issue_id) === Number(body.gcd_issue_id))) return NextResponse.json({ error: "That issue was not a scan result" }, { status: 400 });
  const { data, error } = await supabase.from("cover_scans").update({ chosen_gcd_issue_id: Number(body.gcd_issue_id) }).eq("id", body.scan_id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) { console.error("PATCH /api/cover-scan failed", error); return NextResponse.json({ error: "Could not record selection" }, { status: 500 }); }
  if (!data) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
