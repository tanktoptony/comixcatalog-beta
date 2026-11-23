import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { resolveImportRows } from "@/lib/import/resolveRows";
import { aiRowsToday, logImportMisses } from "@/lib/import/importMisses";
import { AI_SUGGEST_BATCH, AI_SUGGEST_DAILY_ROWS, outcomeFor, proposalRow, suggestionResult } from "@/lib/import/aiSuggest";
import { suggestImportRows } from "@/lib/import/aiSuggestClaude";

export const maxDuration = 120;

// Second look at import rows the catalog matcher could not place. Claude
// proposes what each row means; every proposal runs back through the same
// matcher, so only books that exist in the catalog come back, as
// "suggested" (the collector confirms them before anything is added) or as
// an ordinary pick between volumes. Nothing is written to the collection.
export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to import your collection." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows.filter((row) => Number.isInteger(row?.i) && String(row?.series ?? "").trim()) : null;
  if (!rows) return NextResponse.json({ error: "Send rows to check." }, { status: 400 });
  if (rows.length > AI_SUGGEST_BATCH) return NextResponse.json({ error: `Send at most ${AI_SUGGEST_BATCH} rows at a time.` }, { status: 400 });
  if (!rows.length) return NextResponse.json({ rows: [] });

  const supabase = getServiceClient();
  const used = await aiRowsToday(supabase, user.id);
  if (used == null) return NextResponse.json({ error: "A second look isn't available right now." }, { status: 503 });
  const allowed = Math.max(0, AI_SUGGEST_DAILY_ROWS - used);
  if (!allowed) return NextResponse.json({ rows: [], capped: true, limit: AI_SUGGEST_DAILY_ROWS });
  const batch = rows.slice(0, allowed);

  let suggestions;
  try {
    ({ suggestions } = await suggestImportRows(batch));
  } catch (error) {
    console.error("import suggest: model call failed", error);
    await logImportMisses(supabase, user.id, batch.map((row) => ({ row, outcome: "ai_error" })));
    return NextResponse.json({ error: "We couldn't take a second look at these rows. Try again in a minute." }, { status: 502 });
  }

  try {
    const proposals = batch.map((row) => proposalRow(row, suggestions.get(row.i))).filter(Boolean);
    const resolved = proposals.length ? await resolveImportRows(supabase, proposals) : [];
    const resolvedById = new Map(resolved.map((result) => [result.i, result]));
    const results = batch.map((row) => suggestionResult(row, resolvedById.get(row.i), suggestions.get(row.i)));
    await logImportMisses(supabase, user.id, results.map((result, index) => ({
      row: batch[index],
      outcome: outcomeFor(result),
      suggestion: suggestions.get(batch[index].i) ?? null,
      gcdIssueId: result.gcd_issue_id ?? null,
    })));
    return NextResponse.json({ rows: results, capped: batch.length < rows.length, limit: AI_SUGGEST_DAILY_ROWS });
  } catch (error) {
    console.error("import suggest failed", error);
    return NextResponse.json({ error: error.message || "Could not check these rows." }, { status: 500 });
  }
}
