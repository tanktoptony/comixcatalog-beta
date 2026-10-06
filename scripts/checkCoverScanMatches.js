import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { US_PUBLISHER_ALLOWLIST } from "../src/lib/publisher.js";
import { normalizeSeriesSearchWords } from "../src/lib/seriesSearchMatch.js";
import { baseIssueNumber } from "../src/lib/coverMatch.js";
import { rankCoverCandidates } from "../src/lib/coverScan.js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const cases = [
  { series_title: "Cerebus", issue_number: "1", cover_year: 1977, publisher: "Aardvark-Vanaheim", edition_clues: [] },
  { series_title: "Absolute Batman", issue_number: "1", cover_year: 2024, publisher: "DC", edition_clues: [] },
  { series_title: "Street Fighter", issue_number: "2", cover_year: 1993, publisher: "Malibu", edition_clues: [] },
];
for (const item of cases) {
  const { data: series, error } = await supabase.rpc("search_series_by_relevance", { normalized_term: normalizeSeriesSearchWords(item.series_title), allowed_publishers: US_PUBLISHER_ALLOWLIST, result_limit: 1000 });
  if (error) throw error;
  const ids = (series ?? []).slice(0, 100).map((row) => row.gcd_id);
  const { data: issues, error: issueError } = await supabase.from("gcd_issues").select("gcd_id, series_gcd_id, issue_number, publication_date, key_date").in("series_gcd_id", ids).ilike("issue_number", `${baseIssueNumber(item.issue_number)}%`).order("gcd_id").limit(1000);
  if (issueError) throw issueError;
  const top = rankCoverCandidates(item, series ?? [], issues ?? []).slice(0, 3).map(({ issue, series: row, score }) => ({ gcd_issue_id: issue.gcd_id, series: row.title, issue: issue.issue_number, publisher: row.resolved_publisher_cached, series_year: row.year_start_cached, score }));
  console.log(JSON.stringify({ input: item, top }, null, 2));
}
