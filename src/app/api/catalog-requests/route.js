import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { normalizeRequestInput, requestDedupeKey } from "@/lib/catalogRequests";
import { getServiceClient } from "@/lib/supabase/service";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function parseRequest(req) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const photo = form.get("photo");
    return {
      raw: Object.fromEntries([...form.entries()].filter(([key]) => key !== "photo")),
      photo: photo instanceof File && photo.size ? photo : null,
    };
  }
  return { raw: await req.json().catch(() => null), photo: null };
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to request a book." }, { status: 401 });

  const { raw, photo } = await parseRequest(req);
  const normalized = normalizeRequestInput(raw ?? {});
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });
  if (photo && (!PHOTO_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES)) {
    return NextResponse.json({ error: "Choose a JPEG, PNG, or WebP photo under 8 MB." }, { status: 400 });
  }

  const supabase = getServiceClient();
  const sinceMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("catalog_requests")
    .select("id, title, issue_number")
    .eq("user_id", user.id)
    .eq("status", "open")
    .gte("created_at", sinceMonth)
    .order("created_at", { ascending: false })
    .limit(100);
  if (recentError) return NextResponse.json({ error: "Could not check recent requests." }, { status: 500 });
  const dedupeKey = requestDedupeKey(normalized.value);
  const duplicate = (recent ?? []).find((row) => requestDedupeKey(row) === dedupeKey);
  if (duplicate) return NextResponse.json({ ok: true, duplicate: true, id: duplicate.id });

  const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("catalog_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", sinceDay);
  if (countError) return NextResponse.json({ error: "Could not check your request limit." }, { status: 500 });
  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: "You have sent 20 requests today. Try again tomorrow." }, { status: 429 });
  }

  let scan = null;
  const scanId = String(raw?.scan_id ?? "").trim() || null;
  if (scanId) {
    const { data, error } = await supabase
      .from("cover_scans")
      .select("id, storage_path")
      .eq("id", scanId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Could not check that scan." }, { status: 500 });
    if (!data) return NextResponse.json({ error: "That scan was not found." }, { status: 404 });
    scan = data;
  }

  const requestId = randomUUID();
  let photoPath = scan?.storage_path ?? null;
  if (photo && !scanId) {
    const extension = PHOTO_TYPES.get(photo.type);
    photoPath = `${user.id}/requests/${requestId}.${extension}`;
    const { error } = await supabase.storage.from("cover-scans").upload(photoPath, photo, {
      contentType: photo.type,
      upsert: false,
    });
    if (error) return NextResponse.json({ error: "Could not upload that photo." }, { status: 500 });
  }

  const { error } = await supabase.from("catalog_requests").insert({
    id: requestId,
    user_id: user.id,
    ...normalized.value,
    scan_id: scan?.id ?? null,
    photo_path: photoPath,
  });
  if (error) {
    console.error("catalog request insert failed", error);
    return NextResponse.json({ error: "Could not send your request." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: requestId }, { status: 201 });
}

export async function GET(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to request a book." }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("catalog_requests")
    .select("id, title, issue_number, publisher, year, status, resolved_gcd_issue_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) return NextResponse.json({ error: "Could not load your requests." }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}
