// Read-only comparison of a GCD SQLite dump with the mirrored US catalog.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { STORY_TYPES } from "./lib/gcdCredits.js";
import { CREDIT_ROLES } from "./lib/gcdDumpImport.js";

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.join("=")];
}));
const PAGE = 1000;

function tupleAfter(query, fields, cursor) {
  if (!cursor) return query;
  const clauses = fields.map((field, index) => {
    const equal = fields.slice(0, index).map((prior) => `${prior}.eq.${cursor[prior]}`);
    const greater = `${field}.gt.${cursor[field]}`;
    return equal.length ? `and(${[...equal, greater].join(",")})` : greater;
  });
  return query.or(clauses.join(","));
}

async function scanAll(supabase, table, fields, visit, keyFields = fields) {
  let cursor = null;
  let count = 0;
  for (;;) {
    let query = supabase.from(table).select(fields.join(","));
    query = tupleAfter(query, keyFields, cursor);
    for (const field of keyFields) query = query.order(field);
    const { data, error } = await query.limit(PAGE);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    for (const row of data) visit(row);
    count += data.length;
    if (data.length < PAGE) break;
    cursor = data.at(-1);
  }
  return count;
}

async function headCount(supabase, table, configure = (query) => query) {
  const { count, error } = await configure(
    supabase.from(table).select("*", { count: "exact", head: true }),
  );
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return Number(count ?? 0);
}

function dumpCounts(db, mirrorIds) {
  const counts = { stories: 0, issue_creators: 0, issue_reprints: 0, series_creators: 0, creators: 0, edition_links: mirrorIds.size };
  const storyIssues = new Set();
  const creatorKeys = new Set();
  const creators = new Set();
  const seriesCreators = new Set();
  const issueSeries = new Map(db.prepare("select id,series_id from gcd_issue").all().map((row) => [Number(row.id), Number(row.series_id)]));
  const accepted = new Set([...STORY_TYPES, "cover"]);
  for (const row of db.prepare("select st.id,st.issue_id,lower(t.name) type from gcd_story st join gcd_story_type t on t.id=st.type_id where st.deleted=0").iterate()) {
    if (!mirrorIds.has(Number(row.issue_id)) || !accepted.has(row.type)) continue;
    counts.stories += 1;
    storyIssues.add(Number(row.issue_id));
  }
  for (const row of db.prepare("select st.issue_id,lower(t.name) story_type,sc.credit_type_id,cnd.creator_id,c.gcd_official_name name from gcd_story_credit sc join gcd_story st on st.id=sc.story_id join gcd_story_type t on t.id=st.type_id join gcd_creator_name_detail cnd on cnd.id=sc.creator_id join gcd_creator c on c.id=cnd.creator_id where sc.deleted=0 and st.deleted=0 and cnd.deleted=0 and c.deleted=0").iterate()) {
    const issueId = Number(row.issue_id);
    const creatorId = Number(row.creator_id);
    if (!mirrorIds.has(issueId) || !accepted.has(row.story_type) || !String(row.name ?? "").trim()) continue;
    let roles = CREDIT_ROLES.get(Number(row.credit_type_id)) ?? [];
    if (row.story_type === "cover") roles = roles.some((role) => role === "penciller" || role === "inker") ? ["cover"] : [];
    for (const role of roles) {
      creatorKeys.add(`${issueId}\0${creatorId}\0${role}`);
      seriesCreators.add(`${issueSeries.get(issueId)}\0${creatorId}\0${role}`);
    }
    if (roles.length) creators.add(creatorId);
  }
  counts.issue_creators = creatorKeys.size;
  counts.series_creators = seriesCreators.size;
  counts.creators = creators.size;
  const reprints = new Set();
  for (const row of db.prepare("select r.origin_issue_id,r.target_issue_id from gcd_reprint r join gcd_issue oi on oi.id=r.origin_issue_id join gcd_series os on os.id=oi.series_id join stddata_country oc on oc.id=os.country_id join gcd_issue ti on ti.id=r.target_issue_id join gcd_series ts on ts.id=ti.series_id join stddata_country tc on tc.id=ts.country_id where oc.code='us' and tc.code='us' and os.deleted=0 and ts.deleted=0").iterate())
    if (mirrorIds.has(Number(row.origin_issue_id)) && mirrorIds.has(Number(row.target_issue_id)))
      reprints.add(`${row.origin_issue_id}\0${row.target_issue_id}`);
  counts.issue_reprints = reprints.size;
  return { counts, storyIssues };
}

async function run() {
  if (!args.dump) throw new Error("--dump=<path> is required");
  if (!existsSync(args.dump)) throw new Error(`dump not found: ${args.dump}`);
  dotenv.config({ path: ".env.local", quiet: true });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const mirrorIds = new Set();
  await scanAll(supabase, "gcd_issues", ["gcd_id"], (row) => mirrorIds.add(Number(row.gcd_id)));
  const db = new DatabaseSync(args.dump, { readOnly: true });
  db.exec("pragma query_only=on");
  const expected = dumpCounts(db, mirrorIds);
  const actual = { stories: 0, issue_creators: 0, issue_reprints: 0, series_creators: 0, creators: 0, edition_links: 0 };
  const prodStoryIssues = new Set();
  await scanAll(supabase, "gcd_stories", ["gcd_issue_id", "sequence_number"], (row) => {
    if (!mirrorIds.has(Number(row.gcd_issue_id))) return;
    actual.stories += 1;
    prodStoryIssues.add(Number(row.gcd_issue_id));
  });
  await scanAll(supabase, "issue_creators", ["gcd_issue_id", "creator_id", "role"], (row) => {
    if (mirrorIds.has(Number(row.gcd_issue_id))) actual.issue_creators += 1;
  });
  await scanAll(supabase, "issue_reprints", ["origin_issue_id", "target_issue_id"], (row) => {
    if (mirrorIds.has(Number(row.origin_issue_id)) && mirrorIds.has(Number(row.target_issue_id))) actual.issue_reprints += 1;
  });
  actual.series_creators = await headCount(supabase, "series_creators");
  actual.creators = await headCount(supabase, "creators", (query) => query.not("gcd_creator_id", "is", null));
  actual.edition_links = await headCount(supabase, "gcd_issues", (query) => query.not("base_gcd_issue_id", "is", null));
  let failed = false;
  for (const name of Object.keys(expected.counts)) {
    const wanted = expected.counts[name];
    const found = actual[name];
    const shortage = wanted ? (wanted - found) / wanted : 0;
    console.log(`${name} dump=${wanted} prod=${found} short_pct=${(Math.max(0, shortage) * 100).toFixed(3)}`);
    if (shortage > 0.005) failed = true;
  }
  const missing = [...expected.storyIssues].filter((id) => !prodStoryIssues.has(id)).slice(0, 20);
  console.log(`issues_with_dump_stories_but_none_in_prod=${missing.length ? missing.join(",") : "none"}`);
  if (missing.length) failed = true;
  db.close();
  if (failed) process.exitCode = 1;
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) run().catch((error) => { console.error(`verifyGcdDumpImport failed: ${error.message}`); process.exitCode = 1; });

export { dumpCounts, headCount, scanAll, tupleAfter };
