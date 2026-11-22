import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/authServer";
import { getServiceClient } from "@/lib/supabase/service";
import { resolveImportRows } from "@/lib/import/resolveRows";
import { logImportMisses } from "@/lib/import/importMisses";

const ROW_CAP = 200;

// Resolves export rows to catalog issues without writing to the collection.
// Rows nothing matched are logged to import_misses (best effort) so the miss
// rate is measurable. The matching itself lives in src/lib/import/resolveRows.js.
export async function POST(req) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to import your collection." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : null;
  if (!rows) return NextResponse.json({ error: "Send rows to resolve." }, { status: 400 });
  if (rows.length > ROW_CAP) return NextResponse.json({ error: `Resolve accepts at most ${ROW_CAP} rows per request.` }, { status: 400 });

  const supabase = getServiceClient();
  try {
    const results = await resolveImportRows(supabase, rows);
    const byIndex = new Map(rows.map((row) => [row.i, row]));
    // A pick re-resolve (series_gcd_id chosen) is not a fresh miss.
    const misses = results.filter((result) => result.result === "not_found" && !byIndex.get(result.i)?.series_gcd_id)
      .map((result) => ({ row: byIndex.get(result.i), outcome: "not_found" }));
    await logImportMisses(supabase, user.id, misses);
    return NextResponse.json({ rows: results });
  } catch (error) {
    console.error("import resolve failed", error);
    return NextResponse.json({ error: error.message || "Could not resolve this batch." }, { status: 500 });
  }
}
