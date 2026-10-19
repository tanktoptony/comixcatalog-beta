import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { classifyCollectionBook } from "@/lib/collectionReconcile";
import { loadReconcileCandidates } from "@/lib/collectionReconcileData";

async function loadEntry(supabase, userId, collectionId = null) {
  let query = supabase.from("user_collections")
    .select("id,user_id,comic_id,gcd_issue_id,reconcile_dismissed_at")
    .eq("user_id", userId).is("gcd_issue_id", null).not("comic_id", "is", null)
    .is("reconcile_dismissed_at", null);
  if (collectionId) query = query.eq("id", collectionId);
  const { data: rows, error: rowError } = await query;
  if (rowError) throw new Error(`collection rows: ${rowError.message}`);
  if (!rows?.length) return [];

  const { data: comics, error: comicError } = await supabase.from("comics")
    .select("id,series_title,issue_number,publisher,release_year")
    .in("id", [...new Set(rows.map((row) => row.comic_id))]);
  if (comicError) throw new Error(`comics: ${comicError.message}`);
  const comicById = new Map((comics ?? []).map((comic) => [comic.id, comic]));
  const candidatesByComic = await loadReconcileCandidates(supabase, comics ?? []);
  return rows.map((row) => {
    const comic = comicById.get(row.comic_id);
    return { row, comic, ...classifyCollectionBook(comic, candidatesByComic.get(row.comic_id) ?? []) };
  });
}

async function addCovers(supabase, entries) {
  const ids = [...new Set(entries.flatMap((entry) => entry.candidates.map((candidate) => candidate.gcd_id)))];
  if (!ids.length) return entries;
  const { data, error } = await supabase.from("canonical_covers")
    .select("gcd_issue_id,storage_path").in("gcd_issue_id", ids).not("storage_path", "is", null);
  if (error) throw new Error(`covers: ${error.message}`);
  const covers = new Map((data ?? []).map((cover) => [Number(cover.gcd_issue_id), cover.storage_path]));
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return entries.map((entry) => ({
    collection_id: entry.row.id,
    classification: entry.classification,
    comic: entry.comic,
    candidates: entry.candidates.map((candidate) => ({
      gcd_issue_id: Number(candidate.gcd_id),
      series_title: candidate.series_title,
      issue_number: candidate.issue_number,
      year: candidate.publication_date?.slice(0, 4) || candidate.key_date?.slice(0, 4) || candidate.series_year_start,
      cover_url: covers.get(Number(candidate.gcd_id))
        ? `${base}/storage/v1/object/public/canonical-covers/${covers.get(Number(candidate.gcd_id))}` : null,
    })),
  }));
}

export async function GET(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const supabase = getServiceClient();
    const entries = (await loadEntry(supabase, user.id))
      .filter((entry) => entry.classification === "likely" || entry.classification === "ambiguous");
    return NextResponse.json({ entries: await addCovers(supabase, entries) });
  } catch (error) {
    console.error("GET /api/collection/reconcile failed:", error);
    return NextResponse.json({ error: "Could not load book review" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (!body.collection_id || !["link", "dismiss"].includes(body.action)) {
      return NextResponse.json({ error: "collection_id and a valid action are required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    const [entry] = await loadEntry(supabase, user.id, body.collection_id);
    if (!entry) return NextResponse.json({ error: "Book is not available for review" }, { status: 404 });

    if (body.action === "dismiss") {
      const { data, error } = await supabase.from("user_collections")
        .update({ reconcile_dismissed_at: new Date().toISOString() })
        .eq("id", entry.row.id).eq("user_id", user.id).is("gcd_issue_id", null).select("id").maybeSingle();
      if (error) throw new Error(`dismiss: ${error.message}`);
      if (!data) return NextResponse.json({ error: "Book changed during review" }, { status: 409 });
      return NextResponse.json({ dismissed: true });
    }

    const gcdIssueId = Number(body.gcd_issue_id);
    const allowed = (entry.classification === "likely" || entry.classification === "ambiguous")
      && entry.candidates.some((candidate) => Number(candidate.gcd_id) === gcdIssueId);
    if (!allowed) return NextResponse.json({ error: "That candidate is no longer valid" }, { status: 409 });
    const { data: collision, error: collisionError } = await supabase.from("user_collections")
      .select("id").eq("user_id", user.id).eq("gcd_issue_id", gcdIssueId).neq("id", entry.row.id).limit(1);
    if (collisionError) throw new Error(`duplicate check: ${collisionError.message}`);
    if (collision?.length) return NextResponse.json({ error: "This issue is already in your library" }, { status: 409 });

    const { data: log, error: logError } = await supabase.from("collection_relinks").insert({
      user_collection_id: entry.row.id, user_id: user.id, old_comic_id: entry.row.comic_id,
      old_gcd_issue_id: null, new_gcd_issue_id: gcdIssueId,
      method: "member", confidence: entry.classification,
    }).select("id").single();
    if (logError) throw new Error(`relink log: ${logError.message}`);
    const { data: updated, error: updateError } = await supabase.from("user_collections")
      .update({ gcd_issue_id: gcdIssueId }).eq("id", entry.row.id).eq("user_id", user.id)
      .is("gcd_issue_id", null).select("id").maybeSingle();
    if (updateError || !updated) {
      const { error: cleanupError } = await supabase.from("collection_relinks").delete().eq("id", log.id);
      if (cleanupError) throw new Error(`link failed and audit cleanup failed: ${cleanupError.message}`);
      return NextResponse.json({ error: "Book changed during review" }, { status: 409 });
    }
    return NextResponse.json({ linked: true, relink_id: log.id });
  } catch (error) {
    console.error("POST /api/collection/reconcile failed:", error);
    return NextResponse.json({ error: "Could not save book review" }, { status: 500 });
  }
}
