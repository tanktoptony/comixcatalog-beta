// Diagnoses why series.featured_cover_path_cached coverage is so low.
// Quantifies: (1) canonical_covers size, (2) how many distinct titles, (3) how
// well those titles match series.title exact vs case-insensitive vs trimmed.
// No writes — read-only.

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PAGE_SIZE = 1000;

async function paginate(builderFn) {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await builderFn().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function run() {
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  const { count: ccCount } = await supabase
    .from("canonical_covers")
    .select("id", { count: "exact", head: true });
  console.log(`canonical_covers rows: ${ccCount ?? 0}`);

  const { count: seriesCount } = await supabase
    .from("series")
    .select("id", { count: "exact", head: true })
    .not("gcd_id", "is", null);
  console.log(`series rows (with gcd_id): ${seriesCount ?? 0}`);

  console.log("\nLoading distinct canonical_covers.series_title values…");
  const ccTitleRows = await paginate(() =>
    supabase.from("canonical_covers").select("series_title").not("series_title", "is", null)
  );
  const ccTitlesRaw = new Set();
  const ccTitlesNorm = new Set();
  for (const r of ccTitleRows) {
    if (r.series_title) {
      ccTitlesRaw.add(r.series_title);
      ccTitlesNorm.add(normalize(r.series_title));
    }
  }
  console.log(`  distinct (raw):        ${ccTitlesRaw.size}`);
  console.log(`  distinct (normalized): ${ccTitlesNorm.size}`);

  console.log("\nLoading series.title values…");
  const seriesRows = await paginate(() =>
    supabase.from("series").select("title").not("gcd_id", "is", null)
  );

  let exactHits = 0;
  let normHits = 0;
  let noTitle = 0;
  const seriesTitlesRaw = new Set();
  const seriesTitlesNorm = new Set();
  for (const r of seriesRows) {
    if (!r.title) {
      noTitle += 1;
      continue;
    }
    seriesTitlesRaw.add(r.title);
    seriesTitlesNorm.add(normalize(r.title));
    if (ccTitlesRaw.has(r.title)) exactHits += 1;
    if (ccTitlesNorm.has(normalize(r.title))) normHits += 1;
  }

  const total = seriesRows.length;
  const fmt = (n) => `${n} (${total ? ((n / total) * 100).toFixed(1) : "0.0"}%)`;

  console.log("\n──────── Title match analysis ────────");
  console.log(`series rows scanned:           ${total}`);
  console.log(`series with empty title:       ${noTitle}`);
  console.log(`exact-match in canonical:      ${fmt(exactHits)}`);
  console.log(`normalized-match in canonical: ${fmt(normHits)}`);
  console.log(`gap from normalization alone:  ${normHits - exactHits} series`);

  // Sample unmatched series titles to inspect what's typical
  const unmatched = [];
  for (const t of seriesTitlesRaw) {
    if (!ccTitlesNorm.has(normalize(t))) {
      unmatched.push(t);
      if (unmatched.length >= 25) break;
    }
  }
  console.log("\nSample series titles with NO canonical cover (first 25):");
  unmatched.forEach((t) => console.log(`  - ${t}`));

  // Sample CC titles that don't match any series exactly (might match normalized)
  const ccUnmatchedExact = [];
  for (const t of ccTitlesRaw) {
    if (!seriesTitlesRaw.has(t)) {
      ccUnmatchedExact.push(t);
      if (ccUnmatchedExact.length >= 25) break;
    }
  }
  console.log("\nSample canonical_covers titles NOT exact-matching series (first 25):");
  ccUnmatchedExact.forEach((t) => console.log(`  - ${JSON.stringify(t)}`));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
