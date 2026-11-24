import { issueYearFrom } from "../../src/lib/compValue.js";
import { loadPriceChartingRows } from "../../src/lib/pcValue.js";
import { valueCopy } from "../../src/lib/copyValue.js";

const PAGE = 1000;
const CHUNK = 200;
const WINDOW_DAYS = 90;
const TRANSIENT_CODES = new Set(["57014", "53300", "PGRST116", "ETIMEDOUT"]);

export async function runWithRetry(label, thunk, maxAttempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await thunk();
    if (!error) return data;
    const code = error.code || "";
    const message = (error.message || "").toLowerCase();
    const transient = TRANSIENT_CODES.has(code) || message.includes("timeout") || message.includes("fetch failed") || message.includes("network") || message === "";
    lastError = error;
    if (!transient || attempt === maxAttempts) throw error;
    const backoffMs = [1000, 3000, 8000][attempt - 1] ?? 8000;
    console.error(`  ${label} transient error (attempt ${attempt}/${maxAttempts}): ${error.message || error.code || "unknown"}; retrying in ${backoffMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
  throw lastError;
}

export async function fetchAllPages(build, orderCol) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = await runWithRetry(`page (from=${from})`, () => build().order(orderCol).range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export async function fetchByIds(supabase, table, columns, idColumn, ids, extra = (query) => query) {
  const rows = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const orderCol = idColumn === "gcd_id" ? "gcd_id" : "id";
    rows.push(...await fetchAllPages(() => extra(supabase.from(table).select(columns).in(idColumn, chunk)), orderCol));
  }
  return rows;
}

function priceChartingGuide(result) {
  return { url: result.url, pc_id: result.pc_id, grade_used: result.grade_used };
}

export async function loadCopyValues(supabase, { userIds = null, log = console.log } = {}) {
  const requestedUserIds = userIds == null ? null : [...new Set(userIds.map(String).filter(Boolean))];
  if (requestedUserIds?.length === 0) return [];

  log("Loading owned collection rows...");
  const owned = [];
  const userChunks = requestedUserIds == null ? [null] : Array.from(
    { length: Math.ceil(requestedUserIds.length / CHUNK) },
    (_, index) => requestedUserIds.slice(index * CHUNK, (index + 1) * CHUNK)
  );
  for (const userChunk of userChunks) {
    owned.push(...await fetchAllPages(() => {
      let query = supabase
        .from("user_collections")
        .select("id, user_id, gcd_issue_id, market_value, grade_numeric, slab_company, condition")
        .in("status", ["owned", "for_sale"]);
      if (userChunk) query = query.in("user_id", userChunk);
      return query;
    }, "id"));
  }
  log(`Owned rows: ${owned.length}`);

  const gcdIssueIds = [...new Set(owned.map((row) => row.gcd_issue_id).filter((value) => value != null))];
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const issues = await fetchByIds(supabase, "gcd_issues", "gcd_id, series_gcd_id, key_date, publication_date, variant_of_gcd_id, variant_name", "gcd_id", gcdIssueIds);
  const issueById = new Map(issues.map((row) => [Number(row.gcd_id), row]));
  const seriesIds = [...new Set(issues.map((row) => row.series_gcd_id).filter((value) => value != null))];
  const series = await fetchByIds(supabase, "series", "id, gcd_id, title, year_start_cached", "gcd_id", seriesIds);
  const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));
  log(`Resolved ${issueById.size} distinct issues across ${seriesById.size} series.`);

  // Regular covers of variants too: a variant with no guide row or comps of
  // its own falls back to them (src/lib/copyValue.js).
  const baseIds = [...new Set(issues.map((row) => row.variant_of_gcd_id).filter((value) => value != null).map(Number))];
  const compIds = [...new Set([...gcdIssueIds.map(Number), ...baseIds])];
  const comps = await fetchByIds(supabase, "market_comps", "id, gcd_issue_id, grade_bucket, grade_numeric, sold_price, sold_date, source, listing_title", "gcd_issue_id", compIds, (query) => query.gte("sold_date", sinceIso));
  const compsByIssue = new Map();
  for (const row of comps) {
    const key = Number(row.gcd_issue_id);
    if (!compsByIssue.has(key)) compsByIssue.set(key, []);
    compsByIssue.get(key).push(row);
  }
  log(`Loaded ${comps.length} comps in the ${WINDOW_DAYS}-day window.`);

  const guideIds = [...new Set([...gcdIssueIds, ...issues.map((row) => row.variant_of_gcd_id).filter((value) => value != null)].map(Number))];
  const guide = await runWithRetry("price guide", async () => {
    const result = await loadPriceChartingRows(supabase, guideIds);
    return { data: result.rowsByIssue, error: result.error };
  });
  log(`Loaded price guide rows for ${guide.size} issues.`);

  return owned.map((item) => {
    const base = { id: item.id, user_id: item.user_id, gcd_issue_id: item.gcd_issue_id, grade_numeric: item.grade_numeric, slab_company: item.slab_company, condition: item.condition };
    const userValue = Number(item.market_value);
    if (Number.isFinite(userValue) && userValue > 0) return { ...base, value: userValue, source: "user", guide: null };

    const issueRow = issueById.get(Number(item.gcd_issue_id));
    const seriesRow = issueRow ? seriesById.get(Number(issueRow.series_gcd_id)) : null;
    const { value } = valueCopy({
      item,
      issueRow,
      issue: { seriesTitle: seriesRow?.title ?? null, issueYear: issueYearFrom(issueRow), seriesStartYear: seriesRow?.year_start_cached ?? null },
      guideRows: guide,
      comps: compsByIssue.get(Number(item.gcd_issue_id)) ?? [],
      regularComps: issueRow?.variant_of_gcd_id != null ? (compsByIssue.get(Number(issueRow.variant_of_gcd_id)) ?? []) : [],
    });
    if (value.source === "pricecharting") {
      return { ...base, value: value.value, source: value.regular_cover ? "pricecharting-regular" : "pricecharting", guide: priceChartingGuide(value) };
    }
    return { ...base, value: value.value ?? 0, source: value.source === "market-comp" ? "comps" : "none", guide: null };
  });
}
