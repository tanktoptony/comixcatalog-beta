const CV_ISSUES_URL = "https://comicvine.gamespot.com/api/issues/";
const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 30;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchRecentComicVineIssues({
  apiKey,
  sinceDate,
  throughDate = new Date().toISOString().slice(0, 10),
  pageDelayMs = 1100,
  maxPages = DEFAULT_MAX_PAGES,
  fields = ["id", "issue_number", "store_date", "cover_date", "volume"],
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) throw new Error("COMICVINE_API_KEY missing");
  if (!sinceDate) throw new Error("sinceDate is required");

  const all = [];
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      filter: `store_date:${sinceDate}|${throughDate}`,
      field_list: fields.join(","),
    });
    const url = `${CV_ISSUES_URL}?${params}`;
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "ComixCatalog/1.0", Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`ComicVine HTTP ${response.status} for ${url}`);
    const body = await response.json();
    if (body?.error !== "OK" || Number(body?.status_code) !== 1) {
      throw new Error(`ComicVine API error ${body?.status_code ?? "unknown"}: ${body?.error ?? "unknown error"}`);
    }

    const results = Array.isArray(body.results) ? body.results : [];
    all.push(...results);
    const total = Number(body.number_of_total_results);
    if (results.length < PAGE_SIZE || (Number.isFinite(total) && all.length >= total)) return all;
    if (page + 1 < maxPages) await sleep(pageDelayMs);
  }

  console.warn(
    `WARNING: ComicVine recent-issues pagination hit the ${maxPages}-page safety cap ` +
      `(${all.length} issues). Results are incomplete.`
  );
  return all;
}
