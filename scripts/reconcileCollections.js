// Reconcile legacy collection rows with the GCD mirror. Dry run by default.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { classifyCollectionBook, findOwnershipCollision } from "../src/lib/collectionReconcile.js";
import { loadReconcileCandidates } from "../src/lib/collectionReconcileData.js";

const PAGE_SIZE = 500;

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const revertArg = argv.find((arg) => arg.startsWith("--revert="));
  if (apply && revertArg) throw new Error("Choose --apply or --revert, not both");
  return { apply, revert: revertArg?.slice("--revert=".length) ?? null };
}

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function keyset(supabase, table, columns, configure = (query) => query, key = "id") {
  const rows = [];
  let after = null;
  for (;;) {
    let query = configure(supabase.from(table).select(columns).order(key, { ascending: true }).limit(PAGE_SIZE));
    if (after != null) query = query.gt(key, after);
    const { data, error } = await query;
    if (error) throw new Error(`${table} page after ${after ?? "start"}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return rows;
    after = data.at(-1)[key];
  }
}

async function loadPlan(supabase) {
  const collectionRows = await keyset(
    supabase, "user_collections", "id,user_id,comic_id,gcd_issue_id,status",
    (query) => query.is("gcd_issue_id", null).not("comic_id", "is", null).is("reconcile_dismissed_at", null),
  );
  if (!collectionRows.length) return [];

  const comicIds = [...new Set(collectionRows.map((row) => row.comic_id))];
  const { data: comics, error: comicError } = await supabase.from("comics")
    .select("id,series_title,issue_number,publisher,release_year").in("id", comicIds);
  if (comicError) throw new Error(`comics: ${comicError.message}`);
  const comicById = new Map((comics ?? []).map((comic) => [comic.id, comic]));

  const candidatesByComic = await loadReconcileCandidates(supabase, comics ?? []);

  const userIds = [...new Set(collectionRows.map((row) => row.user_id))];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,username").in("id", userIds);
  if (profileError) throw new Error(`profiles: ${profileError.message}`);
  const usernames = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));

  return collectionRows.map((row) => {
    const comic = comicById.get(row.comic_id);
    const match = comic ? classifyCollectionBook(comic, candidatesByComic.get(comic.id) ?? []) : { classification: "none", candidates: [] };
    return { row, comic, username: usernames.get(row.user_id) ?? row.user_id, ...match };
  });
}

function printPlan(plan) {
  const counts = { exact: 0, likely: 0, ambiguous: 0, none: 0 };
  for (const entry of plan) {
    counts[entry.classification] += 1;
    const matches = entry.candidates.length ? entry.candidates : [null];
    for (const match of matches) {
      console.log([
        entry.classification.toUpperCase(), entry.username,
        `${entry.comic?.series_title ?? "[missing comic]"} #${entry.comic?.issue_number ?? "?"} (${entry.comic?.release_year ?? "year unknown"})`,
        match ? `=> ${match.series_title} (${match.series_year_start ?? "?"}-${match.series_year_end ?? "?"}) #${match.issue_number} [gcd ${match.gcd_id}]` : "=> no match",
      ].join(" | "));
    }
  }
  console.log(`Counts: exact=${counts.exact} likely=${counts.likely} ambiguous=${counts.ambiguous} none=${counts.none}`);
}

async function applyExact(supabase, plan) {
  let linked = 0;
  let skipped = 0;
  for (const entry of plan.filter((item) => item.classification === "exact")) {
    const target = Number(entry.candidate.gcd_id);
    const { data: owned, error: ownedError } = await supabase.from("user_collections")
      .select("id,user_id,gcd_issue_id").eq("user_id", entry.row.user_id).eq("gcd_issue_id", target);
    if (ownedError) throw new Error(`duplicate check ${entry.row.id}: ${ownedError.message}`);
    if (findOwnershipCollision(owned, entry.row.user_id, target, entry.row.id)) {
      console.log(`SKIP duplicate | ${entry.username} | collection ${entry.row.id} | gcd ${target}`);
      skipped += 1;
      continue;
    }
    const { data: log, error: logError } = await supabase.from("collection_relinks").insert({
      user_collection_id: entry.row.id, user_id: entry.row.user_id,
      old_comic_id: entry.row.comic_id, old_gcd_issue_id: entry.row.gcd_issue_id,
      new_gcd_issue_id: target, method: "auto", confidence: "exact",
    }).select("id").single();
    if (logError) throw new Error(`relink log ${entry.row.id}: ${logError.message}`);
    const { data: updated, error: updateError } = await supabase.from("user_collections")
      .update({ gcd_issue_id: target }).eq("id", entry.row.id).eq("user_id", entry.row.user_id)
      .is("gcd_issue_id", null).select("id").maybeSingle();
    if (updateError || !updated) {
      const { error: cleanupError } = await supabase.from("collection_relinks").delete().eq("id", log.id);
      if (cleanupError) throw new Error(`update failed and log cleanup failed for ${entry.row.id}: ${cleanupError.message}`);
      throw new Error(`update ${entry.row.id}: ${updateError?.message ?? "row changed during apply"}`);
    }
    linked += 1;
  }
  console.log(`Apply complete: linked=${linked} duplicate_skips=${skipped}`);
}

async function revert(supabase, target) {
  const logs = target === "all"
    ? await keyset(supabase, "collection_relinks", "id,user_collection_id,user_id,old_comic_id,old_gcd_issue_id,new_gcd_issue_id,reverted_at", (q) => q.is("reverted_at", null))
    : await (async () => {
      if (!/^\d+$/.test(target)) throw new Error("--revert must be a relink id or all");
      const { data, error } = await supabase.from("collection_relinks").select("*").eq("id", target).maybeSingle();
      if (error) throw new Error(`relink ${target}: ${error.message}`);
      return data ? [data] : [];
    })();
  let reverted = 0;
  for (const log of logs) {
    if (log.reverted_at) continue;
    const { data, error } = await supabase.from("user_collections")
      .update({ comic_id: log.old_comic_id, gcd_issue_id: log.old_gcd_issue_id })
      .eq("id", log.user_collection_id).eq("user_id", log.user_id)
      .eq("gcd_issue_id", log.new_gcd_issue_id).select("id").maybeSingle();
    if (error) throw new Error(`restore relink ${log.id}: ${error.message}`);
    if (!data) { console.log(`SKIP changed row | relink ${log.id}`); continue; }
    const { error: markError } = await supabase.from("collection_relinks")
      .update({ reverted_at: new Date().toISOString() }).eq("id", log.id).is("reverted_at", null);
    if (markError) throw new Error(`mark relink ${log.id}: ${markError.message}`);
    reverted += 1;
  }
  console.log(`Revert complete: reverted=${reverted}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = client();
  if (args.revert) return revert(supabase, args.revert);
  const plan = await loadPlan(supabase);
  printPlan(plan);
  if (!args.apply) console.log("Dry run only. Pass --apply to link exact matches.");
  else await applyExact(supabase, plan);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
