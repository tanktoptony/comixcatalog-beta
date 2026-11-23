// import_misses (migration 0115): every import row the matcher could not
// place, and what the AI fallback made of it. Writes are best effort: a
// logging failure (or the table not existing yet) never fails an import.

const clip = (value, max = 200) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

export function missRecord(userId, { row, outcome, suggestion = null, gcdIssueId = null }) {
  return {
    user_id: userId,
    series: clip(row?.series),
    issue: clip(row?.issue, 40),
    publisher: clip(row?.publisher, 120),
    year: clip(row?.series_year ?? row?.issue_year ?? row?.year, 20),
    outcome,
    suggestion,
    gcd_issue_id: Number.isFinite(Number(gcdIssueId)) && gcdIssueId != null ? Number(gcdIssueId) : null,
  };
}

export async function logImportMisses(supabase, userId, misses) {
  if (!misses?.length) return;
  const { error } = await supabase.from("import_misses").insert(misses.map((miss) => missRecord(userId, miss)));
  if (error) console.error("import misses not logged:", error.message);
}

// AI rows used today (UTC) by one member, for the daily cap. Null when the
// count can't be read, which the caller treats as "don't run the AI".
export async function aiRowsToday(supabase, userId, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase.from("import_misses").select("id", { count: "exact", head: true })
    .eq("user_id", userId).like("outcome", "ai_%").gte("created_at", start.toISOString());
  if (error || !Number.isFinite(count)) {
    if (error) console.error("import AI usage read failed:", error.message);
    return null;
  }
  return count;
}
