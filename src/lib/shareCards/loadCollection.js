import { collectionStats } from "./collectionStats.js";

// Server-only loader for the "My Collection" share card. Takes a service-role
// client and a VERIFIED user id (from getAuthedUser, never from the request),
// so a card can only ever describe the caller's own collection.
//
// Every read is paginated. PostgREST silently caps a response at 1000 rows,
// and an unpaginated read here would print a wrong number on a card someone
// then posts publicly. This codebase has shipped that bug three times.

const PAGE = 1000;
const IN_CHUNK = 300; // keep .in() lists well inside URL length limits

async function fetchAllPages(buildQuery) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

async function fetchIn(ids, buildQuery) {
  const out = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    out.push(...(await fetchAllPages(() => buildQuery(ids.slice(i, i + IN_CHUNK)))));
  }
  return out;
}

function parseYear(value) {
  const m = String(value ?? "").match(/\b(18|19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

const norm = (v) => String(v ?? "").trim().toLowerCase();

export async function loadCollectionCard(supabase, userId) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", userId)
    .single();
  if (profileError || !profile) throw new Error("profile not found");

  const rows = await fetchAllPages(() =>
    supabase
      .from("user_collections")
      .select("id, status, gcd_issue_id, created_at, comics!user_collections_comic_id_fkey ( series_title, publisher )")
      .eq("user_id", userId)
      .order("id")
  );

  const gcdIds = [...new Set(rows.map((r) => r.gcd_issue_id).filter((v) => v != null))];
  const issues = await fetchIn(gcdIds, (chunk) =>
    supabase
      .from("gcd_issues")
      .select("gcd_id, series_gcd_id, issue_number, publication_date, key_date")
      .in("gcd_id", chunk)
      .order("gcd_id")
  );
  const issueById = new Map(issues.map((i) => [i.gcd_id, i]));

  const seriesIds = [...new Set(issues.map((i) => i.series_gcd_id).filter(Boolean))];
  const seriesRows = await fetchIn(seriesIds, (chunk) =>
    supabase
      .from("series")
      .select("gcd_id, title, resolved_publisher_cached, publisher:publisher_id(name)")
      .in("gcd_id", chunk)
      .order("gcd_id")
  );
  const seriesById = new Map(seriesRows.map((s) => [String(s.gcd_id), s]));

  const statRows = rows.map((r) => {
    if (r.gcd_issue_id != null) {
      const issue = issueById.get(r.gcd_issue_id);
      const series = issue ? seriesById.get(String(issue.series_gcd_id)) : null;
      return {
        status: r.status,
        seriesKey: issue?.series_gcd_id ? `gcd-${issue.series_gcd_id}` : null,
        // resolved_publisher_cached is the audited, year-aware value; GCD's
        // raw publisher link is a fallback only (see /api/public-profile).
        publisher: series?.resolved_publisher_cached ?? series?.publisher?.name ?? null,
      };
    }
    return {
      status: r.status,
      seriesKey: r.comics?.series_title ? `local-${norm(r.comics.series_title)}` : null,
      publisher: r.comics?.publisher ?? null,
    };
  });

  const stats = collectionStats(statRows);
  const covers = await latestCovers(supabase, rows, issueById);

  return {
    username: profile.username,
    displayName: profile.display_name || profile.username,
    stats,
    covers,
  };
}

// Up to three covers from the most recently added OWNED books. Strict on
// purpose: a cover is used only when canonical_covers has this exact series
// id + issue number with a year within one of the issue's own. Anything
// less certain is skipped. A wrong cover on someone's shared card is worse
// than one fewer cover (the sitewide wrong-cover fallback was removed for the
// same reason).
async function latestCovers(supabase, rows, issueById) {
  const recent = rows
    .filter((r) => r.status === "owned" && r.gcd_issue_id != null)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const seen = new Set();
  const out = [];
  for (const r of recent) {
    if (out.length >= 3) break;
    if (seen.has(r.gcd_issue_id)) continue;
    seen.add(r.gcd_issue_id);
    // Bounded: stop looking after a dozen candidates rather than walk a
    // 2,000-book collection one query at a time.
    if (seen.size > 12) break;

    const issue = issueById.get(r.gcd_issue_id);
    if (!issue?.series_gcd_id) continue;
    const year = parseYear(issue.publication_date) ?? parseYear(issue.key_date);
    if (year == null) continue;

    const { data } = await supabase
      .from("canonical_covers")
      .select("storage_path, cover_date, series_year")
      .eq("series_gcd_id", issue.series_gcd_id)
      .eq("issue_number", issue.issue_number)
      .not("storage_path", "is", null)
      .limit(10);

    let best = null;
    let bestDiff = Infinity;
    for (const c of data ?? []) {
      const cy = parseYear(c.cover_date) ?? (c.series_year != null ? Number(c.series_year) : null);
      if (cy == null) continue;
      const diff = Math.abs(cy - year);
      if (diff <= 1 && diff < bestDiff) {
        best = c;
        bestDiff = diff;
      }
    }
    if (best) out.push(best.storage_path);
  }
  return out;
}
