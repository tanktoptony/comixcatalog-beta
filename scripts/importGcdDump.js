// Bulk-import the GCD SQLite dump. The source is always opened read-only and
// every PostgREST read is keyset-paginated to avoid its silent 1,000-row cap.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { STORY_TYPES } from "./lib/gcdCredits.js";
import {
  CREDIT_ROLES,
  createSeriesCreditAggregator,
  dedupeRows,
  fillStoryCreditText,
  formatStoryCharacters,
  reserveSlug,
  rolesForCreditType,
  unambiguousLegacyAttachments,
} from "./lib/gcdDumpImport.js";

const DEFAULT_DB =
  "C:/Users/antho/Desktop/comixcatalog-frontend/gcd-dump/2026-10-10.db";
const PHASES = [
  "creators",
  "details",
  "stories",
  "credits",
  "rollup",
  "reprints",
];
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.length ? rest.join("=") : true];
    }),
);
const options = {
  db: String(args.db ?? DEFAULT_DB),
  phase: String(args.phase ?? "all"),
  dryRun: Boolean(args["dry-run"]),
  limit: args.limit == null ? null : Number(args.limit),
  batch: Number(args.batch ?? 500),
  sleep: Number(args.sleep ?? 1500),
  seriesIds: args["series-gcd-ids"]
    ? String(args["series-gcd-ids"]).split(",").map(Number)
    : [],
  resume: Boolean(args.resume),
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const clean = (value) =>
  value == null || !String(value).trim() ? null : String(value).trim();
const numeric = (value) =>
  value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const yearOf = (keydate) =>
  /^\d{4}/.test(keydate ?? "") ? Number(String(keydate).slice(0, 4)) : null;
const placeholders = (count) => Array(count).fill("?").join(",");

function validateOptions() {
  if (options.phase !== "all" && !PHASES.includes(options.phase))
    throw new Error(`unknown --phase=${options.phase}`);
  for (const [name, value] of [
    ["batch", options.batch],
    ["sleep", options.sleep],
  ])
    if (!Number.isInteger(value) || value < (name === "sleep" ? 0 : 1))
      throw new Error(`--${name} is invalid`);
  if (
    options.limit != null &&
    (!Number.isInteger(options.limit) || options.limit < 1)
  )
    throw new Error("--limit must be a positive integer");
  if (options.seriesIds.some((id) => !Number.isInteger(id) || id < 1))
    throw new Error("--series-gcd-ids must contain positive integers");
  validateRollupLimit(options);
}

function validateRollupLimit(candidate) {
  if (
    candidate.phase === "rollup" &&
    candidate.limit != null &&
    !candidate.seriesIds.length
  ) {
    throw new Error(
      "--phase=rollup cannot be combined with --limit unless --series-gcd-ids is provided; rollup must aggregate the full selection",
    );
  }
}

function cursorPath(phase) {
  return resolve("tmp", `gcd-dump-${phase}-cursor.json`);
}
function cachePath() {
  return resolve("tmp", "gcd-dump-issue-ids.json");
}
function seriesCachePath() {
  return resolve("tmp", "gcd-dump-series-ids.json");
}
function saveCursor(phase, gcdIssueId) {
  const path = cursorPath(phase);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ gcd_issue_id: gcdIssueId, updated_at: new Date().toISOString() })}\n`,
  );
}
function loadCursor(phase) {
  if (!options.resume || !existsSync(cursorPath(phase))) return 0;
  return (
    Number(JSON.parse(readFileSync(cursorPath(phase), "utf8")).gcd_issue_id) ||
    0
  );
}
function saveRollupCursor(batchIndex) {
  const path = cursorPath("rollup");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ batch_index: batchIndex, updated_at: new Date().toISOString() })}\n`,
  );
}
function loadRollupCursor() {
  if (!options.resume || !existsSync(cursorPath("rollup"))) return -1;
  return Number(
    JSON.parse(readFileSync(cursorPath("rollup"), "utf8")).batch_index ?? -1,
  );
}

function fail(label, error) {
  if (error)
    throw new Error(
      `${label}: ${error.code ? `${error.code} | ` : ""}${error.message}`,
    );
}
async function retry(label, operation, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await operation();
    if (!result.error) return result.data ?? [];
    const status = Number(result.error.status ?? result.error.code);
    if (attempt === attempts || !(status >= 500 || status === 429))
      fail(label, result.error);
    await sleep(1000 * 2 ** (attempt - 1));
  }
}

async function loadMirrorIds(supabase) {
  if (existsSync(cachePath()))
    return new Set(JSON.parse(readFileSync(cachePath(), "utf8")));
  if (!supabase) return null;
  const ids = [];
  let after = 0;
  for (;;) {
    const rows = await retry("read gcd_issues", () =>
      supabase
        .from("gcd_issues")
        .select("gcd_id")
        .gt("gcd_id", after)
        .order("gcd_id")
        .limit(1000),
    );
    if (!rows.length) break;
    ids.push(...rows.map((row) => Number(row.gcd_id)));
    after = Number(rows.at(-1).gcd_id);
    if (rows.length < 1000) break;
  }
  mkdirSync("tmp", { recursive: true });
  writeFileSync(cachePath(), JSON.stringify(ids));
  return new Set(ids);
}

async function loadMirrorSeriesIds(supabase) {
  if (existsSync(seriesCachePath()))
    return new Set(JSON.parse(readFileSync(seriesCachePath(), "utf8")));
  if (!supabase) return null;
  const ids = [];
  let after = 0;
  for (;;) {
    const rows = await retry("read gcd_series", () =>
      supabase
        .from("gcd_series")
        .select("gcd_id")
        .gt("gcd_id", after)
        .order("gcd_id")
        .limit(1000),
    );
    if (!rows.length) break;
    ids.push(...rows.map((row) => Number(row.gcd_id)));
    after = Number(rows.at(-1).gcd_id);
    if (rows.length < 1000) break;
  }
  mkdirSync("tmp", { recursive: true });
  writeFileSync(seriesCachePath(), JSON.stringify(ids));
  return new Set(ids);
}

function selectIssues(db, mirrorIds, selectionOptions = options) {
  const params = [];
  let where = "c.code='us' and i.deleted=0 and s.deleted=0";
  if (selectionOptions.seriesIds.length) {
    where += ` and i.series_id in (${placeholders(selectionOptions.seriesIds.length)})`;
    params.push(...selectionOptions.seriesIds);
  }
  const rows = db
    .prepare(
      `select i.id, i.series_id, i.key_date from gcd_issue i join gcd_series s on s.id=i.series_id join stddata_country c on c.id=s.country_id where ${where} order by i.id`,
    )
    .all(...params);
  const after =
    selectionOptions.ignoreCursor || selectionOptions.phase === "all"
      ? 0
      : loadCursor(selectionOptions.phase);
  const eligible = [];
  let skippedNotMirrored = 0;
  let skippedResume = 0;
  for (const row of rows) {
    if (Number(row.id) <= after) {
      skippedResume += 1;
      continue;
    }
    if (mirrorIds && !mirrorIds.has(Number(row.id))) {
      skippedNotMirrored += 1;
      continue;
    }
    eligible.push({
      id: Number(row.id),
      series_id: Number(row.series_id),
      key_date: row.key_date,
    });
    if (
      !selectionOptions.ignoreLimit &&
      selectionOptions.limit &&
      eligible.length >= selectionOptions.limit
    )
      break;
  }
  return { issues: eligible, skippedNotMirrored, skippedResume };
}

function chunks(rows, size = options.batch) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
function printSamples(phase, rows, limit = 5) {
  for (const row of rows.slice(0, limit))
    console.log(`${phase} sample ${JSON.stringify(row)}`);
}
function progress(phase, batches, rows, totalBatches, started) {
  const seconds = Math.max((Date.now() - started) / 1000, 0.001);
  const rate = rows / seconds;
  const eta = rate
    ? Math.round(((totalBatches - batches) * options.batch) / rate)
    : 0;
  console.log(
    `${phase} batches=${batches}/${totalBatches} rows=${rows} rate=${rate.toFixed(1)}/s eta=${eta}s`,
  );
}

function storyRows(db, issueBatch, stats) {
  if (!issueBatch.length) return [];
  const ids = issueBatch.map((issue) => issue.id);
  const marks = placeholders(ids.length);
  const accepted = [...STORY_TYPES, "cover"];
  const raw = db
    .prepare(
      `select st.id,st.issue_id,st.sequence_number,ty.name type,st.title,st.feature,st.script,st.pencils,st.inks,st.colors,st.letters,st.characters,st.synopsis,st.page_count,st.job_number,st.genre from gcd_story st join gcd_story_type ty on ty.id=st.type_id where st.deleted=0 and lower(ty.name) in (${placeholders(accepted.length)}) and st.issue_id in (${marks}) order by st.issue_id,st.sequence_number,st.id`,
    )
    .all(...accepted, ...ids);
  const characters = new Map();
  const storyCredits = new Map();
  for (const storyBatch of chunks(
    raw.map((row) => row.id),
    500,
  )) {
    // story_character.character_id points to character_name_detail.id (the
    // Django field name is misleading), just like story_credit.creator_id.
    const characterRows = db
      .prepare(
        `select sc.story_id,sc.id,c.id character_id,c.name,sc.notes from gcd_story_character sc indexed by idx_gcd_story_character_gcd_story_character_story_id_13ce6388_fk_gcd_story_id left join gcd_character_name_detail cnd on cnd.id=sc.character_id and cnd.deleted=0 left join gcd_character c on c.id=cnd.character_id and c.deleted=0 where sc.deleted=0 and sc.story_id in (${placeholders(storyBatch.length)}) order by sc.story_id,sc.id`,
      )
      .all(...storyBatch);
    const characterIds = [
      ...new Set(
        characterRows
          .map((row) => Number(row.character_id))
          .filter((id) => Number.isInteger(id)),
      ),
    ];
    const relations = characterIds.length
      ? db
          .prepare(
            `select id,from_character_id,to_character_id from gcd_character_relation indexed by idx_gcd_character_relation_gcd_character_relati_from_character_id_f632780f_fk_gcd_chara where relation_type_id=2 and from_character_id in (${placeholders(characterIds.length)}) union select id,from_character_id,to_character_id from gcd_character_relation indexed by idx_gcd_character_relation_gcd_character_relati_to_character_id_e08d735a_fk_gcd_chara where relation_type_id=2 and to_character_id in (${placeholders(characterIds.length)}) order by id`,
          )
          .all(...characterIds, ...characterIds)
      : [];
    for (const row of characterRows) {
      if (!row.character_id || !clean(row.name)) {
        stats.invalid_character_name += 1;
        continue;
      }
      if (!characters.has(row.story_id)) characters.set(row.story_id, []);
      characters.get(row.story_id).push(row);
    }
    for (const storyId of storyBatch) {
      if (characters.has(storyId)) {
        const rows = characters.get(storyId);
        const ids = new Set(rows.map((row) => Number(row.character_id)));
        characters.set(
          storyId,
          formatStoryCharacters(
            rows,
            relations.filter(
              (relation) =>
                ids.has(Number(relation.from_character_id)) &&
                ids.has(Number(relation.to_character_id)),
            ),
          ),
        );
      }
    }
    const creditRows = db
      .prepare(
        `select sc.id,sc.story_id,sc.credit_type_id,c.gcd_official_name name from gcd_story_credit sc indexed by idx_gcd_story_credit_gcd_story_credit_story_id_7b35c2b5_fk_gcd_story_id left join gcd_creator_name_detail cnd on cnd.id=sc.creator_id and cnd.deleted=0 left join gcd_creator c on c.id=cnd.creator_id and c.deleted=0 where sc.deleted=0 and sc.story_id in (${placeholders(storyBatch.length)}) order by sc.story_id,sc.id`,
      )
      .all(...storyBatch);
    for (const credit of creditRows) {
      if (!clean(credit.name)) continue;
      if (!storyCredits.has(credit.story_id)) storyCredits.set(credit.story_id, []);
      storyCredits.get(credit.story_id).push(credit);
    }
  }
  const used = new Map();
  return raw.map((original) => {
    const row = fillStoryCreditText(original, storyCredits.get(original.id) ?? []);
    if (!used.has(row.issue_id)) used.set(row.issue_id, new Set());
    const issueUsed = used.get(row.issue_id);
    let sequence = numeric(row.sequence_number) ?? 0;
    if (issueUsed.has(sequence)) {
      stats.duplicate_sequence += 1;
      while (issueUsed.has(sequence)) sequence += 1;
    }
    issueUsed.add(sequence);
    return {
      gcd_issue_id: Number(row.issue_id),
      sequence_number: sequence,
      type: clean(row.type),
      title: clean(row.title),
      feature: clean(row.feature),
      script: clean(row.script),
      pencils: clean(row.pencils),
      inks: clean(row.inks),
      colors: clean(row.colors),
      letters: clean(row.letters),
      characters: characters.get(row.id)?.join("; ") ?? clean(row.characters),
      synopsis: clean(row.synopsis),
      page_count: numeric(row.page_count),
      job_number: clean(row.job_number),
      genre: clean(row.genre),
    };
  });
}

function creditRows(db, issueBatch, stats) {
  if (!issueBatch.length) return [];
  const ids = issueBatch.map((issue) => issue.id);
  const accepted = [...STORY_TYPES, "cover"];
  const stories = db
    .prepare(
      `select st.id,st.issue_id,stt.name story_type from gcd_story st join gcd_story_type stt on stt.id=st.type_id where st.deleted=0 and lower(stt.name) in (${placeholders(accepted.length)}) and st.issue_id in (${placeholders(ids.length)})`,
    )
    .all(...accepted, ...ids);
  const storyById = new Map(stories.map((row) => [Number(row.id), row]));
  const raw = [];
  for (const storyBatch of chunks([...storyById.keys()], 500))
    raw.push(
      ...db
        .prepare(
          `select sc.story_id,sc.credit_type_id,cnd.creator_id,c.gcd_official_name name from gcd_story_credit sc indexed by idx_gcd_story_credit_gcd_story_credit_story_id_7b35c2b5_fk_gcd_story_id left join gcd_creator_name_detail cnd on cnd.id=sc.creator_id and cnd.deleted=0 left join gcd_creator c on c.id=cnd.creator_id and c.deleted=0 where sc.deleted=0 and sc.story_id in (${placeholders(storyBatch.length)})`,
        )
        .all(...storyBatch),
    );
  const rows = [];
  for (const row of raw) {
    if (!row.creator_id || !clean(row.name)) {
      stats.invalid_creator_reference += 1;
      continue;
    }
    const story = storyById.get(Number(row.story_id));
    const roles = rolesForCreditType(row.credit_type_id, story.story_type);
    if (!CREDIT_ROLES.has(Number(row.credit_type_id)))
      stats.unknown_credit_type += 1;
    for (const role of roles)
      rows.push({
        gcd_issue_id: Number(story.issue_id),
        gcd_creator_id: Number(row.creator_id),
        name: clean(row.name),
        role,
      });
  }
  const deduped = dedupeRows(rows, ["gcd_issue_id", "gcd_creator_id", "role"]);
  stats.duplicate_credit += rows.length - deduped.length;
  return deduped;
}

// GCD has several US creators sharing a name (three Roy Thomases; the one
// with 17,830 credits is the famous one). A legacy name-only row came from
// specific issues, so the right identity is whichever same-named GCD creator
// is credited on those issues. Attach only when exactly one is.
async function overlapLegacyAttachments(db, supabase, legacy, usMatches) {
  const idsByName = new Map();
  for (const row of usMatches) {
    if (!idsByName.has(row.name)) idsByName.set(row.name, new Set());
    idsByName.get(row.name).add(Number(row.gcd_creator_id));
  }
  const attachments = [];
  for (const row of legacy) {
    if ((idsByName.get(row.name)?.size ?? 0) < 2) continue;
    const credits = await retry(`read credits for ${row.name}`, () =>
      supabase
        .from("issue_creators")
        .select("gcd_issue_id")
        .eq("creator_id", row.id)
        .order("gcd_issue_id")
        .limit(1000),
    );
    const issueIds = [...new Set(credits.map((credit) => Number(credit.gcd_issue_id)))];
    const found = new Set();
    for (const batch of chunks(issueIds, 500)) {
      const matches = db
        .prepare(
          `select distinct c.id gcd_creator_id from gcd_story st indexed by idx_gcd_story_IssueID join gcd_story_credit sc indexed by idx_gcd_story_credit_gcd_story_credit_story_id_7b35c2b5_fk_gcd_story_id on sc.story_id=st.id and +sc.deleted=0 join gcd_creator_name_detail nd on nd.id=sc.creator_id join gcd_creator c on c.id=nd.creator_id and c.deleted=0 where st.issue_id in (${placeholders(batch.length)}) and +st.deleted=0 and c.gcd_official_name=?`,
        )
        .all(...batch, row.name);
      for (const match of matches) found.add(Number(match.gcd_creator_id));
    }
    if (found.size === 1) attachments.push({ ...row, gcd_creator_id: [...found][0] });
  }
  return attachments;
}

async function existingCreators(supabase) {
  const rows = [];
  let after = 0;
  for (;;) {
    const page = await retry("read creators", () =>
      supabase
        .from("creators")
        .select("id,name,slug,gcd_creator_id")
        .gt("id", after)
        .order("id")
        .limit(1000),
    );
    if (!page.length) break;
    rows.push(...page);
    after = Number(page.at(-1).id);
    if (page.length < 1000) break;
  }
  return rows;
}

async function writeBatches(supabase, phase, table, rows, conflict) {
  let written = 0;
  const all = chunks(rows);
  const started = Date.now();
  for (let index = 0; index < all.length; index += 1) {
    await retry(`upsert ${table}`, () =>
      supabase.from(table).upsert(all[index], { onConflict: conflict }),
    );
    written += all[index].length;
    if ((index + 1) % 10 === 0 || index + 1 === all.length)
      progress(phase, index + 1, written, all.length, started);
    await sleep(options.sleep);
  }
  return written;
}

async function creatorPhase(db, issues, supabase, stats) {
  const found = new Map();
  for (const batch of chunks(issues))
    for (const row of creditRows(db, batch, stats))
      found.set(row.gcd_creator_id, {
        gcd_creator_id: row.gcd_creator_id,
        name: row.name,
      });
  const dumpRows = [...found.values()].sort(
    (a, b) => a.gcd_creator_id - b.gcd_creator_id,
  );
  if (options.dryRun) {
    printSamples("creators", dumpRows);
    return {
      rows: dumpRows.length,
      map: new Map(
        dumpRows.map((row) => [row.gcd_creator_id, row.gcd_creator_id]),
      ),
    };
  }
  const existing = await existingCreators(supabase);
  const usedSlugs = new Set(existing.map((row) => row.slug));
  const byGcd = new Map(
    existing
      .filter((row) => row.gcd_creator_id != null)
      .map((row) => [Number(row.gcd_creator_id), row]),
  );
  const legacy = existing.filter((row) => row.gcd_creator_id == null);
  // Resolve ambiguity against every US-referenced identity, even when this is
  // a limited test import, so a partial run can never attach the wrong person.
  const legacyNames = [...new Set(legacy.map((row) => row.name))];
  const usMatches = [];
  // The unary + keeps SQLite off the low-selectivity deleted indexes. Without
  // it the planner walks all 12M story credits instead of starting from the
  // few hundred names (found on the first real run, 2026-10-13).
  for (const nameBatch of chunks(legacyNames, 500))
    usMatches.push(
      ...db
        .prepare(
          `select distinct c.id gcd_creator_id,c.gcd_official_name name from gcd_creator c join gcd_creator_name_detail nd on nd.creator_id=c.id and +nd.deleted=0 join gcd_story_credit sc on sc.creator_id=nd.id and +sc.deleted=0 join gcd_story st on st.id=sc.story_id and +st.deleted=0 join gcd_issue i on i.id=st.issue_id and +i.deleted=0 join gcd_series s on s.id=i.series_id and +s.deleted=0 join stddata_country country on country.id=s.country_id and country.code='us' where c.deleted=0 and c.gcd_official_name in (${placeholders(nameBatch.length)})`,
        )
        .all(...nameBatch),
    );
  const attachments = [
    ...unambiguousLegacyAttachments(legacy, usMatches),
    ...(await overlapLegacyAttachments(db, supabase, legacy, usMatches)),
  ].filter((row) => {
    // A row from an earlier run may already own this GCD id. Attaching would
    // violate the unique key and abort the run, so report it for a merge.
    if (!byGcd.has(row.gcd_creator_id)) return true;
    console.log(
      `legacy creator needs merge id=${row.id} name=${JSON.stringify(row.name)} gcd_creator_id=${row.gcd_creator_id} existing_id=${byGcd.get(row.gcd_creator_id).id}`,
    );
    return false;
  });
  const attachedIds = new Set(attachments.map((row) => row.gcd_creator_id));
  for (const row of attachments) {
    await retry(`attach creator ${row.name}`, () =>
      supabase
        .from("creators")
        .update({ gcd_creator_id: row.gcd_creator_id })
        .eq("id", row.id),
    );
    await sleep(options.sleep);
  }
  const inserts = dumpRows
    .filter(
      (row) =>
        !byGcd.has(row.gcd_creator_id) && !attachedIds.has(row.gcd_creator_id),
    )
    .map((row) => ({ ...row, slug: reserveSlug(row.name, usedSlugs) }));
  await writeBatches(
    supabase,
    "creators",
    "creators",
    inserts,
    "gcd_creator_id",
  );
  if (issues.length) saveCursor("creators", issues.at(-1).id);
  const matchedIdsByName = new Map();
  for (const row of usMatches) {
    if (!matchedIdsByName.has(row.name))
      matchedIdsByName.set(row.name, new Set());
    matchedIdsByName.get(row.name).add(Number(row.gcd_creator_id));
  }
  const attachedLegacyRowIds = new Set(
    attachments.map((row) => Number(row.id)),
  );
  for (const row of legacy.filter(
    (candidate) => !attachedLegacyRowIds.has(Number(candidate.id)),
  )) {
    const matches = matchedIdsByName.get(row.name);
    console.log(
      `legacy creator not attached id=${row.id} name=${JSON.stringify(row.name)} slug=${JSON.stringify(row.slug)} reason=${matches?.size ? "ambiguous" : "no US match"}`,
    );
  }
  const refreshed = await existingCreators(supabase);
  return {
    rows: inserts.length + attachments.length,
    map: new Map(
      refreshed
        .filter((row) => row.gcd_creator_id != null)
        .map((row) => [Number(row.gcd_creator_id), Number(row.id)]),
    ),
  };
}

async function detailsPhase(db, issues, supabase) {
  let count = 0;
  let shown = false;
  for (const batch of chunks(issues)) {
    const ids = batch.map((i) => i.id);
    const rows = db
      .prepare(
        `select i.id gcd_issue_id,i.on_sale_date,i.price,i.page_count,i.editing,i.barcode,i.isbn,i.notes,i.indicia_frequency,ip.name indicia_publisher,i.variant_name,i.key_date keydate,i.rating from gcd_issue i left join gcd_indicia_publisher ip on ip.id=i.indicia_publisher_id and ip.deleted=0 where i.id in (${placeholders(ids.length)}) order by i.id`,
      )
      .all(...ids)
      .map((row) => ({
        ...Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            key === "gcd_issue_id" || key === "page_count"
              ? value
              : clean(value),
          ]),
        ),
        page_count: numeric(row.page_count),
        not_found: false,
        synced_at: new Date().toISOString(),
      }));
    if (options.dryRun) {
      if (!shown) {
        printSamples("details", rows);
        shown = true;
      }
    } else {
      await writeBatches(
        supabase,
        "details",
        "gcd_issue_details",
        rows,
        "gcd_issue_id",
      );
      saveCursor("details", batch.at(-1).id);
    }
    count += rows.length;
  }
  return count;
}

async function storiesPhase(db, issues, supabase, stats) {
  let count = 0;
  let shown = false;
  for (const batch of chunks(issues)) {
    const rows = storyRows(db, batch, stats);
    if (options.dryRun) {
      if (!shown) {
        printSamples("stories", rows);
        shown = true;
      }
    } else {
      const ids = batch.map((i) => i.id);
      await retry("delete stories", () =>
        supabase.from("gcd_stories").delete().in("gcd_issue_id", ids),
      );
      await sleep(options.sleep);
      await writeBatches(
        supabase,
        "stories",
        "gcd_stories",
        rows,
        "gcd_issue_id,sequence_number",
      );
      saveCursor("stories", ids.at(-1));
    }
    count += rows.length;
  }
  return count;
}

async function creditsPhase(db, issues, supabase, creatorMap, stats) {
  let count = 0;
  let shown = false;
  for (const batch of chunks(issues)) {
    let rows = creditRows(db, batch, stats);
    if (options.dryRun) {
      if (!shown) {
        printSamples("credits", rows);
        shown = true;
      }
    } else {
      rows = rows.flatMap(({ gcd_creator_id, name, ...row }) =>
        creatorMap.has(gcd_creator_id)
          ? [{ ...row, creator_id: creatorMap.get(gcd_creator_id) }]
          : ((stats.missing_creator_map += 1), []),
      );
      await retry("delete issue credits", () =>
        supabase
          .from("issue_creators")
          .delete()
          .in(
            "gcd_issue_id",
            batch.map((issue) => issue.id),
          ),
      );
      await sleep(options.sleep);
      await writeBatches(
        supabase,
        "credits",
        "issue_creators",
        rows,
        "gcd_issue_id,creator_id,role",
      );
      saveCursor("credits", batch.at(-1).id);
    }
    count += rows.length;
  }
  return count;
}

async function rollupPhase(
  db,
  issues,
  supabase,
  creatorMap,
  mirrorSeriesIds,
  stats,
) {
  const aggregator = createSeriesCreditAggregator();
  const creatorNames = new Map();
  for (const batch of chunks(issues)) {
    const issueById = new Map(batch.map((row) => [row.id, row]));
    const rows = creditRows(db, batch, stats).flatMap((row) => {
      creatorNames.set(row.gcd_creator_id, row.name);
      const issue = issueById.get(row.gcd_issue_id);
      const creatorId = options.dryRun
        ? row.gcd_creator_id
        : creatorMap.get(row.gcd_creator_id);
      if (creatorId == null) {
        stats.missing_creator_map += 1;
        return [];
      }
      return [
        {
          series_gcd_id: issue.series_id,
          gcd_issue_id: row.gcd_issue_id,
          creator_id: creatorId,
          role: row.role,
          year: yearOf(issue.key_date),
        },
      ];
    });
    aggregator.add(rows);
  }
  const rows = aggregator
    .rows()
    .filter((row) => {
      if (!mirrorSeriesIds || mirrorSeriesIds.has(row.series_gcd_id))
        return true;
      stats.missing_series_map += 1;
      return false;
    })
    .sort(
      (a, b) =>
        b.issue_count - a.issue_count ||
        a.series_gcd_id - b.series_gcd_id ||
        a.creator_id - b.creator_id ||
        a.role.localeCompare(b.role),
    );
  if (options.dryRun) {
    const namedRows = rows.map((row) => ({
      ...row,
      creator_name: creatorNames.get(row.creator_id),
    }));
    printSamples("rollup", namedRows, 10);
    for (const row of namedRows.filter((candidate) => ["Stan Lee", "Jack Kirby"].includes(candidate.creator_name))) {
      console.log(`rollup named ${JSON.stringify(row)}`);
    }
  } else {
    const batches = chunks(rows);
    const afterBatch = loadRollupCursor();
    const started = Date.now();
    let written = 0;
    for (let index = 0; index < batches.length; index += 1) {
      if (index <= afterBatch) continue;
      await retry("upsert series_creators", () =>
        supabase
          .from("series_creators")
          .upsert(batches[index], {
            onConflict: "series_gcd_id,creator_id,role",
          }),
      );
      written += batches[index].length;
      await sleep(options.sleep);
      saveRollupCursor(index);
      if ((index + 1) % 10 === 0 || index + 1 === batches.length)
        progress("rollup", index + 1, written, batches.length, started);
    }
  }
  return rows.length;
}

async function reprintsPhase(db, issues, supabase, mirrorIds, stats) {
  let count = 0;
  let shown = false;
  for (const issueBatch of chunks(issues)) {
    const ids = issueBatch.map((row) => row.id);
    const raw = db
      .prepare(
        `select r.origin_issue_id,r.target_issue_id,r.notes,oc.code origin_country,tc.code target_country,os.deleted origin_series_deleted,ts.deleted target_series_deleted from gcd_reprint r join gcd_issue oi on oi.id=r.origin_issue_id join gcd_series os on os.id=oi.series_id join stddata_country oc on oc.id=os.country_id join gcd_issue ti on ti.id=r.target_issue_id join gcd_series ts on ts.id=ti.series_id join stddata_country tc on tc.id=ts.country_id where r.origin_issue_id in (${placeholders(ids.length)}) or r.target_issue_id in (${placeholders(ids.length)})`,
      )
      .all(...ids, ...ids);
    const rows = [];
    const seen = new Set();
    for (const row of raw) {
      if (
        row.origin_country !== "us" ||
        row.target_country !== "us" ||
        Number(row.origin_series_deleted) !== 0 ||
        Number(row.target_series_deleted) !== 0
      ) {
        stats.reprint_not_us += 1;
        continue;
      }
      if (
        mirrorIds &&
        (!mirrorIds.has(Number(row.origin_issue_id)) ||
          !mirrorIds.has(Number(row.target_issue_id)))
      ) {
        stats.reprint_missing_mirror += 1;
        continue;
      }
      const key = `${row.origin_issue_id}\0${row.target_issue_id}`;
      if (seen.has(key)) {
        stats.duplicate_reprint += 1;
        continue;
      }
      seen.add(key);
      rows.push({
        origin_issue_id: Number(row.origin_issue_id),
        target_issue_id: Number(row.target_issue_id),
        notes: clean(row.notes),
      });
    }
    if (options.dryRun) {
      if (!shown) {
        printSamples("reprints", rows);
        shown = true;
      }
    } else {
      await retry("delete origin reprints", () =>
        supabase.from("issue_reprints").delete().in("origin_issue_id", ids),
      );
      await sleep(options.sleep);
      await retry("delete target reprints", () =>
        supabase.from("issue_reprints").delete().in("target_issue_id", ids),
      );
      await sleep(options.sleep);
      await writeBatches(
        supabase,
        "reprints",
        "issue_reprints",
        rows,
        "origin_issue_id,target_issue_id",
      );
      saveCursor("reprints", issueBatch.at(-1).id);
    }
    count += rows.length;
  }
  return count;
}

async function run() {
  validateOptions();
  const db = new DatabaseSync(options.db, { readOnly: true });
  db.exec("pragma query_only=on");
  let supabase = null;
  if (!options.dryRun) {
    const [{ default: dotenv }, { createClient }] = await Promise.all([
      import("dotenv"),
      import("@supabase/supabase-js"),
    ]);
    dotenv.config({ path: ".env.local", quiet: true });
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
  }
  const mirrorIds = await loadMirrorIds(supabase);
  if (!mirrorIds)
    console.warn(
      "dry-run: no local gcd_issues cache; mirror membership cannot be checked (run one non-dry phase to create it)",
    );
  const phases = options.phase === "all" ? PHASES : [options.phase];
  const mirrorSeriesIds = phases.includes("rollup")
    ? await loadMirrorSeriesIds(supabase)
    : null;
  if (phases.includes("rollup") && !mirrorSeriesIds)
    console.warn(
      "dry-run: no local gcd_series cache; series membership cannot be checked (run one non-dry rollup to create it)",
    );
  const selection = selectIssues(
    db,
    mirrorIds,
    phases.length === 1 && phases[0] === "rollup"
      ? { ...options, ignoreLimit: true, ignoreCursor: true }
      : options,
  );
  const stats = {
    invalid_character_name: 0,
    duplicate_sequence: 0,
    invalid_creator_reference: 0,
    unknown_credit_type: 0,
    duplicate_credit: 0,
    missing_creator_map: 0,
    missing_series_map: 0,
    reprint_missing_mirror: 0,
    reprint_not_us: 0,
    duplicate_reprint: 0,
  };
  console.log(
    `selected issues=${selection.issues.length} skipped_not_mirrored=${selection.skippedNotMirrored} skipped_resume=${selection.skippedResume}`,
  );
  let creatorMap = new Map();
  const counts = {};
  if (
    phases.some((phase) => ["credits", "rollup"].includes(phase)) &&
    !phases.includes("creators") &&
    !options.dryRun
  )
    creatorMap = new Map(
      (await existingCreators(supabase))
        .filter((r) => r.gcd_creator_id != null)
        .map((r) => [Number(r.gcd_creator_id), Number(r.id)]),
    );
  for (const phase of phases) {
    const phaseIssues =
      phase === "rollup"
        ? selectIssues(db, mirrorIds, {
            ...options,
            phase,
            ignoreLimit: true,
            ignoreCursor: true,
          }).issues
        : options.resume && options.phase === "all"
          ? selection.issues.filter((issue) => issue.id > loadCursor(phase))
          : selection.issues;
    if (options.resume && options.phase === "all")
      console.log(
        `${phase} resume selected=${phaseIssues.length} skipped=${selection.issues.length - phaseIssues.length}`,
      );
    if (phase === "creators") {
      const result = await creatorPhase(db, phaseIssues, supabase, stats);
      counts.creators = result.rows;
      creatorMap = result.map;
    }
    if (phase === "details")
      counts.details = await detailsPhase(db, phaseIssues, supabase);
    if (phase === "stories")
      counts.stories = await storiesPhase(db, phaseIssues, supabase, stats);
    if (phase === "credits")
      counts.credits = await creditsPhase(
        db,
        phaseIssues,
        supabase,
        creatorMap,
        stats,
      );
    if (phase === "rollup")
      counts.rollup = await rollupPhase(
        db,
        phaseIssues,
        supabase,
        creatorMap,
        mirrorSeriesIds,
        stats,
      );
    if (phase === "reprints")
      counts.reprints = await reprintsPhase(
        db,
        phaseIssues,
        supabase,
        mirrorIds,
        stats,
      );
  }
  console.log(
    `summary counts=${JSON.stringify(counts)} skipped_invalid=${JSON.stringify(stats)}`,
  );
  db.close();
}

export { run, storyRows, creditRows, selectIssues, validateRollupLimit };
const direct =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct)
  run().catch((error) => {
    console.error(`importGcdDump failed: ${error?.message ?? error}`);
    process.exitCode = 1;
  });
