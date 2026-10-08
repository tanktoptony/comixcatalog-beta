// GET /api/admin/production-assets/asset?issueId=gcd-123
//
// Returns the actual cover image bytes for one catalog issue, validated,
// for the asset-pack ZIP. ADMIN_ID only.
//
// One file per request on purpose: covers run to ~1.7 MB each and Vercel caps
// a function response at 4.5 MB, so a server-built ZIP of an 18-book episode
// would work in dev and fail in production. The page fetches files through
// here and zips them in the browser.
//
// The client sends only an issue id. Which file that means is decided here,
// by the issue page's own handler, and the bytes come from our
// canonical-covers bucket via the service client — never from a URL the
// client supplied, and never from the third-party source when we hold a copy.

import { NextResponse } from "next/server";
import { sniffImage, assetBaseName } from "@/lib/productionAssets";
import { titleVariants } from "@/lib/titleMatch";
import { serviceClient, adminRefusal, lookupIssue } from "@/lib/productionAssetsServer";

export const dynamic = "force-dynamic";

const ISSUE_ID = /^(gcd-\d+|cv-\d+-[A-Za-z0-9.]+)$/;

function fail(status, error, extra = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

// Provenance for the manifest. canonical_covers.storage_path is not indexed,
// so find the row through the indexed columns the issue route itself matches
// on (series_gcd_id, then series_title) and pick the one with our path.
async function findCoverRow(supabase, issueId, info) {
  const cols = "id, source, original_cover_url, source_issue_url, storage_path";
  let seriesGcdId = null;
  if (issueId.startsWith("gcd-")) {
    const { data, error } = await supabase
      .from("gcd_issues")
      .select("series_gcd_id")
      .eq("gcd_id", Number(issueId.slice(4)))
      .maybeSingle();
    if (error) throw error;
    seriesGcdId = data?.series_gcd_id ?? null;
  } else {
    seriesGcdId = Number(issueId.split("-")[1]);
  }
  if (seriesGcdId) {
    const { data, error } = await supabase
      .from("canonical_covers")
      .select(cols)
      .eq("series_gcd_id", seriesGcdId)
      .eq("issue_number", info.issueNumber);
    if (error) throw error;
    const hit = (data ?? []).find((r) => r.storage_path === info.storagePath);
    if (hit) return hit;
  }
  if (info.seriesTitle) {
    const { data, error } = await supabase
      .from("canonical_covers")
      .select(cols)
      .in("series_title", titleVariants(info.seriesTitle))
      .eq("issue_number", info.issueNumber);
    if (error) throw error;
    const hit = (data ?? []).find((r) => r.storage_path === info.storagePath);
    if (hit) return hit;
  }
  return null;
}

export async function GET(req) {
  const refusal = await adminRefusal(req);
  if (refusal) return refusal;

  const issueId = new URL(req.url).searchParams.get("issueId") ?? "";
  if (!ISSUE_ID.test(issueId)) return fail(400, "Invalid issueId");

  const info = await lookupIssue(issueId);
  if (!info.ok) return fail(404, `Issue lookup failed: ${info.error}`);
  if (!info.storagePath) return fail(404, "The catalog shows no cover for this issue");

  const supabase = serviceClient();
  const { data: blob, error } = await supabase.storage
    .from("canonical-covers")
    .download(info.storagePath);
  if (error || !blob) {
    const status = error?.status ?? error?.statusCode ?? "unknown";
    return fail(502, `Storage download failed (${status}): ${error?.message ?? "no body"}`, {
      storagePath: info.storagePath,
    });
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const reportedType = blob.type || null;
  if (bytes.length === 0) {
    return fail(502, "Storage returned an empty file", { storagePath: info.storagePath });
  }
  // Magic bytes decide. A reported type that is plainly not an image (HTML
  // error page, JSON) is rejected even if something upstream mislabeled it.
  const sniffed = sniffImage(bytes);
  if (!sniffed) {
    return fail(502, `Stored file is not a recognizable image (reported ${reportedType ?? "no type"})`, {
      storagePath: info.storagePath,
    });
  }
  if (reportedType && !/^image\//i.test(reportedType) && !/octet-stream/i.test(reportedType)) {
    return fail(502, `Stored file reported non-image type ${reportedType}`, { storagePath: info.storagePath });
  }

  // Provenance is manifest metadata, not the image. A failed lookup must not
  // cost us the file, but it must not pass as "no source on record" either.
  let coverRow = null;
  let provenanceError = null;
  try {
    coverRow = await findCoverRow(supabase, issueId, info);
  } catch (err) {
    provenanceError = `Provenance lookup failed: ${err?.message ?? String(err)}`;
    console.error("production-assets asset: provenance lookup failed for", issueId, err);
  }
  const meta = {
    issueId,
    seriesId: info.seriesId,
    series: info.seriesTitle,
    issue: info.issueNumber,
    year: info.year,
    publisher: info.publisher,
    storagePath: info.storagePath,
    storageBucket: "canonical-covers",
    canonicalCoverId: coverRow?.id ?? null,
    coverSource: coverRow?.source ?? null,
    originalCoverUrl: coverRow?.original_cover_url ?? null,
    sourceIssueUrl: coverRow?.source_issue_url ?? null,
    provenanceError,
    contentType: sniffed.mime,
    reportedContentType: reportedType,
    ext: sniffed.ext,
    bytes: bytes.length,
    filenameBase: assetBaseName({ seriesTitle: info.seriesTitle, issueNumber: info.issueNumber, year: info.year }),
  };

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": sniffed.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "X-Asset-Meta": encodeURIComponent(JSON.stringify(meta)),
    },
  });
}
