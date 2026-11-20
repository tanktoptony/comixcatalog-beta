// Sync free-licensed Commons portraits matched through Wikidata's exact GCD
// creator id. Dry-run is the default; pass --apply to write.

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getServiceClient } from "../src/lib/supabase/service.js";
import { fetchAllPages } from "../src/lib/supabase/fetchAllPages.js";
import { cleanCredit, commonsTitle, isFreeLicense, parseSparqlRows, pickImagesByGcdId } from "./lib/creatorPhotos.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../.env.local") });

const APPLY = process.argv.includes("--apply");
const USER_AGENT = "ComixCatalog-creator-photos/1.0 (https://www.comixcatalog.com)";
const SPARQL_URL = "https://query.wikidata.org/sparql";
const COMMONS_URL = "https://commons.wikimedia.org/w/api.php";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function fetchJson(url, accept) {
  const response = await fetch(url, { headers: { Accept: accept, "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${new URL(url).hostname}`);
  return response.json();
}

async function wikidataRows() {
  const query = "SELECT ?item ?gcd ?image WHERE { ?item wdt:P9707 ?gcd ; wdt:P18 ?image. }";
  const url = `${SPARQL_URL}?${new URLSearchParams({ query, format: "json" })}`;
  const json = await fetchJson(url, "application/sparql-results+json");
  return parseSparqlRows(json.results?.bindings);
}

async function commonsMetadata(imageByGcd) {
  const entries = [...imageByGcd].map(([gcdId, image]) => ({ gcdId, title: commonsTitle(image) })).filter((row) => row.title);
  const metadata = new Map();
  for (const batch of chunks(entries, 50)) {
    const params = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "320", maxlag: "5", titles: batch.map((row) => row.title).join("|") });
    const json = await fetchJson(`${COMMONS_URL}?${params}`, "application/json");
    // Commons reports maxlag and other failures as a 200 with an error body.
    // Treating that as "no image" would clear real photos, so stop instead.
    if (json.error) throw new Error(`Commons error: ${json.error.code ?? "unknown"} ${json.error.info ?? ""}`.trim());
    const titleKey = (value) => value.replace(/_/g, " ").toLowerCase();
    const byTitle = new Map(Object.values(json.query?.pages ?? {}).map((page) => [titleKey(page.title), page.imageinfo?.[0]]));
    for (const row of batch) metadata.set(row.gcdId, byTitle.get(titleKey(row.title)));
    await sleep(150);
  }
  return metadata;
}

async function main() {
  const supabase = getServiceClient();
  const readCreators = (columns) => fetchAllPages(
    () => supabase.from("creators").select(columns).not("gcd_creator_id", "is", null),
    "id",
    { maxRows: 100000 }
  );
  let creators;
  try {
    creators = await readCreators("id, name, gcd_creator_id, photo_url, photo_page_url, photo_credit, photo_license");
  } catch (error) {
    // Before migration 0107 the photo columns don't exist. A dry run can still
    // report what it would find; an apply has nowhere to write, so it stops.
    if (APPLY) throw error;
    console.log("photo columns missing (migration 0107 not applied); dry run treats every creator as photo-less");
    creators = await readCreators("id, name, gcd_creator_id");
  }
  const rows = await wikidataRows();
  const images = pickImagesByGcdId(rows);
  const matched = creators.filter((creator) => images.has(String(creator.gcd_creator_id)));
  const commons = await commonsMetadata(new Map(matched.map((creator) => [String(creator.gcd_creator_id), images.get(String(creator.gcd_creator_id))])));
  const syncedAt = new Date().toISOString();
  const photos = new Map();
  let skippedByLicense = 0;

  for (const creator of matched) {
    const info = commons.get(String(creator.gcd_creator_id));
    const license = info?.extmetadata?.LicenseShortName?.value;
    if (!info?.thumburl || !info?.descriptionurl || !isFreeLicense(license)) {
      skippedByLicense += 1;
      continue;
    }
    photos.set(creator.id, { id: creator.id, photo_url: info.thumburl.split("?")[0], photo_page_url: info.descriptionurl, photo_credit: cleanCredit(info.extmetadata?.Artist?.value), photo_license: license.trim(), photo_synced_at: syncedAt });
  }

  // Only rows whose photo actually changes get written. Rewriting all 50k
  // creators twice a week would be pointless load on a small database, and a
  // partial-column upsert would also trip the NOT NULL name/slug columns.
  const same = (a, b) => (a ?? null) === (b ?? null);
  const writes = [];
  for (const creator of creators) {
    const next = photos.get(creator.id) ?? { id: creator.id, photo_url: null, photo_page_url: null, photo_credit: null, photo_license: null };
    const unchanged = same(creator.photo_url, next.photo_url) && same(creator.photo_page_url, next.photo_page_url)
      && same(creator.photo_credit, next.photo_credit) && same(creator.photo_license, next.photo_license);
    if (!unchanged) writes.push({ ...next, photo_synced_at: syncedAt });
  }
  const clearing = writes.filter((row) => !row.photo_url).length;
  const hadPhoto = creators.filter((creator) => creator.photo_url).length;
  console.log(`wikidata rows: ${rows.length}`);
  console.log(`matched creators: ${matched.length}`);
  console.log(`free-licensed: ${photos.size}`);
  console.log(`skipped by license: ${skippedByLicense}`);
  console.log(`to write: ${writes.length} (clearing ${clearing} of ${hadPhoto} existing photos)`);
  if (!APPLY) console.table([...photos.values()].slice(0, 10));

  // A Wikidata or Commons hiccup that returns far fewer photos than we
  // already show should never wipe them; a real drop that size needs a look.
  if (hadPhoto > 100 && clearing > hadPhoto * 0.2) {
    throw new Error(`Refusing to clear ${clearing} of ${hadPhoto} photos in one run.`);
  }

  let written = 0;
  if (APPLY) {
    for (const batch of chunks(writes, 8)) {
      const results = await Promise.all(batch.map(({ id, ...fields }) => supabase.from("creators").update(fields).eq("id", id)));
      const failed = results.find((result) => result.error);
      if (failed) throw failed.error;
      written += batch.length;
    }
  }
  console.log(`written: ${written}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
