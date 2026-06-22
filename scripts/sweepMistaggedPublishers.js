// sweepMistaggedPublishers.js
//
// Repair canonical_covers rows whose series_gcd_id points to a GCD series
// record published by a foreign/wrong publisher. Pattern: CV gives us
// "Witchblade" (Image, 1996), our propagator tagged it to a Swedish
// "Witchblade" gcd_series. Cover lookup by series_gcd_id then fails for
// users whose collection item is filed under the US Image GCD record.
//
// Strategy:
//   1. Stream every canonical_cover with series_gcd_id + publisher.
//   2. Look up the tagged GCD series's publisher.
//   3. If publisher mismatch AND the cc publisher is a US-major:
//        a. Find a candidate gcd_series with same title AND a publisher
//           that matches the cc publisher AND a year close to cc.series_year.
//        b. If a unique strong match exists, retag to it.
//   4. Otherwise, null out the bad series_gcd_id so title-path fallback
//      can resolve the cover instead of being misled.
//
// Dry-run by default. Pass --apply to write.

import "dotenv/config";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const NULL_ONLY = process.argv.includes("--null-only"); // safer: just clear bad tags, don't retag
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const MAX_ROWS = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : Infinity;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const US_MAJORS = [
  "Marvel", "DC Comics", "Image", "IDW Publishing", "Dark Horse",
  "BOOM! Studios", "Dynamite Entertainment", "Valiant", "Oni Press",
  "Archie Comics", "Harvey", "Mirage", "Vault Comics", "AfterShock",
  "Aftershock Comics", "Skybound", "Black Mask Studios", "Mad Cave",
  "AWA Studios",
];

function normPub(s) {
  return String(s || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}
function normTitle(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function isUSMajor(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return US_MAJORS.some((p) => lower === p.toLowerCase() || lower.includes(p.toLowerCase()));
}

// Identify truly-foreign publishers by language markers. Legacy US imprints
// like "National Periodical Publications" or "A.I. Menin, rec. Nicholson"
// are NOT foreign and must NOT be remapped — they're correct historical
// publisher names. Only act on names with clear non-English signals.
const FOREIGN_MARKERS = [
  // Germanic
  "förlag", "forlag", "verlag", "uitgeverij", "carlsen", "bonnier",
  // Romance
  "editorial", "edizioni", "editrice", "edition", "editions",
  "ediciones", "edição", "ediciones", "panini ", " panini",
  // Eastern European / Cyrillic-style romanizations
  "wydawnictwo", "izdatelstvo",
  // Asian
  "shogakukan", "shueisha", "kodansha", "takarajima",
  // Mexican/Spanish localizers we've seen
  "novaro", "vid", "televisa", "grupo editorial",
  // Brazilian
  "panini brasil", "abril",
  // French
  "delcourt", "soleil", "glénat", "glenat", "dargaud", "dupuis", "casterman",
  // Greek transliteration tells
  "ekdoseis", "spyros",
];

function looksForeign(pubName) {
  if (!pubName) return false;
  const lower = pubName.toLowerCase();
  if (FOREIGN_MARKERS.some((m) => lower.includes(m))) return true;
  // Diacritics / non-ASCII letters present (German ä/ö/ü, Spanish ñ, etc.)
  if (/[^\x20-\x7E]/.test(pubName)) return true;
  // Mojibake fallback chars
  if ((pubName.match(/[?�]/g) || []).length >= 2) return true;
  return false;
}

async function fetchAllRange(table, select, perPage = 1000, filter) {
  let from = 0;
  const out = [];
  for (;;) {
    let q = sb.from(table).select(select);
    if (filter) q = filter(q);
    q = q.range(from, from + perPage - 1);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < perPage) break;
    from += perPage;
  }
  return out;
}

(async () => {
  console.log("Loading gcd_publishers…");
  const pubs = await fetchAllRange("gcd_publishers", "gcd_id, name");
  const pubMap = new Map(pubs.map((p) => [p.gcd_id, p.name]));
  console.log(`  ${pubs.length.toLocaleString()} publishers loaded`);

  // Build the set of publisher_gcd_ids that ARE the real US-major imprints.
  // We can't rely on a hard-coded list because GCD's IDs aren't stable
  // across dump versions, and our table apparently has its own numbering
  // (publisher 78 in our DB is "Sociedad Editora América", not Marvel).
  // Resolve by name match instead.
  const US_PUB_PATTERNS = [
    /^marvel\b/i, /^dc comics\b/i, /^image comics\b/i,
    /^idw publishing\b/i, /^dark horse\b/i, /^boom!\s*studios\b/i,
    /^dynamite entertainment\b/i, /^valiant\b/i, /^oni press\b/i,
    /^archie comic publications\b/i, /^archie comics$/i,
    /^harvey publications\b/i, /^harvey comics\b/i,
    /^mirage studios\b/i, /^mirage publishing\b/i,
    /^vault comics\b/i, /^aftershock comics\b/i,
    /^skybound\b/i, /^black mask studios\b/i, /^mad cave\b/i,
    /^awa studios\b/i,
  ];
  const US_PUB_IDS = new Set();
  for (const p of pubs) {
    if (US_PUB_PATTERNS.some((re) => re.test(p.name || ""))) US_PUB_IDS.add(p.gcd_id);
  }
  console.log(`  US-major publisher IDs identified: ${US_PUB_IDS.size}`);

  console.log("Loading gcd_series (only ones with a publisher)…");
  const series = await fetchAllRange(
    "gcd_series",
    "gcd_id, name, year_began, publisher_gcd_id",
    1000,
    (q) => q.not("publisher_gcd_id", "is", null)
  );
  console.log(`  ${series.length.toLocaleString()} series loaded`);

  // Index series by normalized title → list of candidates.
  const titleIndex = new Map();
  for (const s of series) {
    const k = normTitle(s.name);
    if (!k) continue;
    let arr = titleIndex.get(k);
    if (!arr) { arr = []; titleIndex.set(k, arr); }
    arr.push(s);
  }
  console.log(`  ${titleIndex.size.toLocaleString()} distinct normalized titles`);

  console.log("Streaming canonical_covers with series_gcd_id set…");
  const covers = await fetchAllRange(
    "canonical_covers",
    "id, publisher, series_title, series_year, series_gcd_id",
    1000,
    (q) => q.not("series_gcd_id", "is", null).not("publisher", "is", null)
  );
  console.log(`  ${covers.length.toLocaleString()} candidate covers`);

  let scanned = 0, mismatches = 0, retag = 0, nullOut = 0, noOp = 0;
  const updates = [];

  for (const cc of covers) {
    scanned++;
    if (scanned > MAX_ROWS) break;

    const tagged = series.find((s) => s.gcd_id === cc.series_gcd_id);
    if (!tagged) continue;
    const taggedPubName = pubMap.get(tagged.publisher_gcd_id) || "";

    // Skip if tagged publisher already matches cc.publisher.
    const ccPubN = normPub(cc.publisher);
    const taggedPubN = normPub(taggedPubName);
    if (!ccPubN || !taggedPubN) continue;
    if (ccPubN === taggedPubN) continue;
    if (taggedPubN.includes(ccPubN) || ccPubN.includes(taggedPubN)) continue;

    // Only act when:
    //   - cc.publisher is a US-major (CV's tag)
    //   - tagged GCD record's publisher_gcd_id is NOT in our US-major set
    //   - AND the publisher name has clear foreign markers (extra safety)
    // The publisher-id check is the precise signal; the name check is
    // belt-and-suspenders against bad name matches.
    if (!isUSMajor(cc.publisher)) continue;
    if (US_PUB_IDS.has(tagged.publisher_gcd_id)) continue;
    if (!looksForeign(taggedPubName)) continue;

    mismatches++;

    // Find a candidate gcd_series with same normalized title whose
    // publisher_gcd_id IS in the US-major whitelist.
    const titleKey = normTitle(tagged.name);
    const candidates = titleIndex.get(titleKey) || [];
    const usCandidates = candidates.filter((c) => US_PUB_IDS.has(c.publisher_gcd_id));

    if (usCandidates.length === 1) {
      updates.push({ id: cc.id, from: cc.series_gcd_id, to: usCandidates[0].gcd_id, op: "retag" });
      retag++;
    } else if (usCandidates.length > 1) {
      const target = cc.series_year || 0;
      usCandidates.sort((a, b) => Math.abs((a.year_began || 0) - target) - Math.abs((b.year_began || 0) - target));
      updates.push({ id: cc.id, from: cc.series_gcd_id, to: usCandidates[0].gcd_id, op: "retag-best-year" });
      retag++;
    }
    // No US candidate → leave tag alone. The cc + the user's filing are
    // both in the foreign GCD record, so the ID path resolves naturally
    // even though it points to a non-US publisher. Nulling would break it.
  }

  console.log(`\nScanned: ${scanned.toLocaleString()}`);
  console.log(`  Foreign-publisher mistags found: ${mismatches.toLocaleString()}`);
  console.log(`    → can retag to a US candidate: ${retag.toLocaleString()}`);
  console.log(`    → no US candidate, will null: ${nullOut.toLocaleString()}`);

  if (!updates.length) { console.log("\nNothing to do."); return; }

  console.log("\nSample of planned changes:");
  for (const u of updates.slice(0, 10)) {
    console.log(` cc ${u.id}  ${u.op}  ${u.from} → ${u.to}`);
  }

  if (!APPLY) {
    console.log("\n(dry run — pass --apply to write)");
    return;
  }

  // Apply in chunks of 200 to keep PostgREST happy.
  console.log("\nApplying…");
  let ok = 0, err = 0;
  const filtered = NULL_ONLY ? updates.filter((u) => u.op === "null") : updates;
  for (let i = 0; i < filtered.length; i += 50) {
    const batch = filtered.slice(i, i + 50);
    await Promise.all(batch.map(async (u) => {
      const { error } = await sb
        .from("canonical_covers")
        .update({ series_gcd_id: u.to })
        .eq("id", u.id);
      if (error) { console.error("  fail", u.id, error.message); err++; }
      else ok++;
    }));
    if ((i + 50) % 500 === 0) console.log(`  ${ok}/${filtered.length}…`);
  }
  console.log(`\nDone. ok=${ok} err=${err}`);
})();
