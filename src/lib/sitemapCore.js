// Sitemap logic with no Next.js or path-alias imports, so it runs under
// node --test. src/lib/sitemap.js is the part that talks to the app.

// Which series earn a /series/<id>/keys URL in the sitemap.
//
// key_issues has no foreign key to gcd_issues, so PostgREST cannot embed one
// in the other. The embed this replaced answered PGRST200 on every call, which
// made all 16 series sitemap files return 500 from 2026-10-22 to 2026-11-04.
// So this takes two steps: walk key_issues (about 7,500 rows) by its unique
// gcd_issue_id, then look up each page's series by gcd_issues' primary key.

export const KEYS_PAGE_MIN_ISSUES = 3;
const PAGE = 500;

export async function seriesGcdIdsWithKeyPages(supabase, read = async (run) => {
  const { data, error } = await run();
  if (error) throw error;
  return data ?? [];
}) {
  const counts = new Map();
  let after = null;
  for (;;) {
    const cursor = after;
    const keyRows = await read(() => {
      let query = supabase
        .from("key_issues")
        .select("gcd_issue_id")
        .order("gcd_issue_id", { ascending: true })
        .limit(PAGE);
      if (cursor != null) query = query.gt("gcd_issue_id", cursor);
      return query;
    }, `key issues after ${cursor ?? "start"}`);
    const ids = keyRows.map((row) => row.gcd_issue_id).filter((id) => id != null);
    if (ids.length > 0) {
      const issues = await read(
        () => supabase.from("gcd_issues").select("series_gcd_id").in("gcd_id", ids).limit(ids.length),
        `key issue series after ${cursor ?? "start"}`,
      );
      // Every key issue has a gcd_issues row, so zero rows means this client
      // can't read the table (RLS answers with an empty list, not an error).
      if (issues.length === 0) throw new Error("gcd_issues returned no rows for key issues; check the client's role");
      for (const issue of issues) {
        if (issue.series_gcd_id == null) continue;
        const series = Number(issue.series_gcd_id);
        counts.set(series, (counts.get(series) ?? 0) + 1);
      }
    }
    if (keyRows.length < PAGE) break;
    after = keyRows.at(-1).gcd_issue_id;
  }
  return [...counts].filter(([, count]) => count >= KEYS_PAGE_MIN_ISSUES).map(([series]) => series);
}

// The slug range for one creators-<part>.xml file. The database collation is
// en_US.UTF-8, which sorts punctuation before letters and digits, so the
// obvious upper bounds of ":" and "{" (the next ASCII characters) match
// nothing: creators-0-9 and creators-z were empty files until 2026-11-04, and
// 208 creators were missing from the sitemap. Digits end where "a" starts, and
// nothing sorts after the z slugs, so z has no upper bound.
export function creatorSlugRange(part) {
  if (part === "0-9") return { lower: "0", upper: "a" };
  if (part === "z") return { lower: "z", upper: null };
  return { lower: part, upper: String.fromCharCode(part.charCodeAt(0) + 1) };
}
