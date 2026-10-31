import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { parseGrade, parsePrice, planOwnedCopies, statusFromValue } from "@/lib/import/import";
import { getServiceClient } from "@/lib/supabase/service";
import { normalizeRawCondition, normalizeSlabCompany, snapToCgcGrade } from "@/lib/valuation";

const ROW_CAP = 200;

function details(row) {
  const parsedGrade = parseGrade(row.grade);
  const slab = normalizeSlabCompany(row.slab_company);
  return {
    grade_numeric: parsedGrade.numeric == null ? null : snapToCgcGrade(parsedGrade.numeric),
    condition: parsedGrade.numeric == null ? normalizeRawCondition(parsedGrade.condition) : null,
    slab_company: slab,
    slab_cert_number: slab ? String(row.cert ?? "").trim().slice(0, 120) || null : null,
    purchase_price: parsePrice(row.price_paid),
    variant_label: String(row.variant ?? "").trim().slice(0, 120) || null,
    notes: String(row.notes ?? "").trim().slice(0, 2000) || null,
  };
}

export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to import your collection." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.rows) || !["owned", "wishlist"].includes(body?.status)) {
    return NextResponse.json({ error: "Send a valid status and rows to import." }, { status: 400 });
  }
  if (body.rows.length > ROW_CAP) return NextResponse.json({ error: `Commit accepts at most ${ROW_CAP} rows per request.` }, { status: 400 });
  const candidates = body.rows.filter((row) => Number.isFinite(Number(row.gcd_issue_id)));
  const candidateIds = [...new Set(candidates.map((row) => Number(row.gcd_issue_id)))];
  const supabase = getServiceClient();

  // Only ids that exist in the catalog get a library row; the client is not
  // trusted to send real ones.
  const { data: known, error: knownError } = candidateIds.length
    ? await supabase.from("gcd_issues").select("gcd_id").in("gcd_id", candidateIds)
    : { data: [], error: null };
  if (knownError) return NextResponse.json({ error: "Could not check the catalog." }, { status: 500 });
  const knownIds = new Set((known ?? []).map((row) => Number(row.gcd_id)));
  const rows = candidates.filter((row) => knownIds.has(Number(row.gcd_issue_id)));
  const issueIds = [...knownIds];

  const { data: existing, error: readError } = issueIds.length
    ? await supabase.from("user_collections").select("gcd_issue_id,status,copy_number").eq("user_id", user.id).in("gcd_issue_id", issueIds)
    : { data: [], error: null };
  if (readError) return NextResponse.json({ error: "Could not check your existing collection." }, { status: 500 });

  const anyRow = new Set();
  const ownedBefore = new Map();
  for (const item of existing ?? []) {
    const id = Number(item.gcd_issue_id);
    anyRow.add(id);
    if (item.status !== "owned" && item.status !== "for_sale") continue;
    const current = ownedBefore.get(id) ?? { count: 0, maxCopy: 0 };
    ownedBefore.set(id, { count: current.count + 1, maxCopy: Math.max(current.maxCopy, Number(item.copy_number) || 1) });
  }

  const inserts = [];
  const outcomes = [];
  const ownedRows = [];
  for (const row of rows) {
    if (statusFromValue(row.status, body.status) !== "wishlist") { ownedRows.push(row); continue; }
    const issueId = Number(row.gcd_issue_id);
    if (anyRow.has(issueId)) {
      outcomes.push({ i: row.i, outcome: "skipped_existing" });
      continue;
    }
    anyRow.add(issueId);
    inserts.push({ user_id: user.id, gcd_issue_id: issueId, comic_id: null, status: "wishlist", copy_number: 1, ...details(row) });
    outcomes.push({ i: row.i, outcome: "imported" });
  }
  const plan = planOwnedCopies(ownedRows, ownedBefore);
  for (const { row, copy_number } of plan.inserts) {
    inserts.push({ user_id: user.id, gcd_issue_id: Number(row.gcd_issue_id), comic_id: null, status: "owned", copy_number, ...details(row) });
  }
  outcomes.push(...plan.outcomes);
  const skipped = outcomes.filter((item) => item.outcome === "skipped_existing").length;

  if (inserts.length) {
    const { error } = await supabase.from("user_collections").insert(inserts);
    if (error) {
      const capped = error.code === "54000" || /Collection limit reached/i.test(error.message);
      return NextResponse.json({ error: capped ? "Collection limit reached at 50,000 copies. No rows from this batch were saved; earlier batches are safe." : `Could not save this batch: ${error.message}`, inserted: 0, skipped_existing: skipped, rows: [] }, { status: capped ? 409 : 500 });
    }
  }
  return NextResponse.json({ inserted: inserts.length, skipped_existing: skipped, rows: outcomes });
}
