import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { getAuthedUser } from "@/lib/authServer";
import { loadRunCompletion } from "@/lib/runCompletion";

const MAX_RESULTS = 6;

export async function GET(req) {
  try {
    const user = await getAuthedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { runs } = await loadRunCompletion(getServiceClient(), user.id);
    return NextResponse.json({
      runs: runs.filter((run) => run.owned < run.total).slice(0, MAX_RESULTS).map((run) => ({
        series_id: run.series_id,
        title: run.title,
        publisher: run.publisher,
        owned: run.owned,
        total: run.total,
        missing: run.missing,
        pct: run.pct,
      })),
    });
  } catch (err) {
    console.error("GET /api/library/run-completion crashed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
