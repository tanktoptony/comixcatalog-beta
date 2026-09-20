// Removes gap-*.json targets that are already sitting in needs_volume_id.json.
//
// Why this exists: comicvine_api_to_supabase.py walks a gap file in order,
// skipping targets recorded in .ingest-done.json for free, and stops at
// --max-search-calls. Targets that fail to resolve are deliberately NOT written
// to the done-ledger (they go to needs_volume_id.json instead) so they stay
// retryable rather than being silently lost forever.
//
// The unintended consequence: nothing defers them either, so they sit
// permanently at the head of the not-yet-done queue and re-consume the whole
// search budget every single hour, never reaching the resolvable targets
// behind them. Observed 2026-09-20: the width lane's first 12 unresolved
// targets were all already in needs_volume_id.json, the lane reported
// `search=30 volume=0 issues=0` with byte-identical output across three
// consecutive hourly runs, and canonical_covers went 26+ hours with zero
// inserts until the stall detector fired.
//
// Pruning them here is safe because they are not being dropped: they remain in
// needs_volume_id.json, which is what scripts/resolveNeedsVolumeIdBacklog.js
// reads (via gap-probe.yml, Mon/Thu) to pin a volume_id and promote them into
// gap-pinned.json. This only stops the bulk lanes from re-attempting a search
// that is already known to fail.
//
// NOTE: this is a stopgap for the head-of-line blockage, not a general fix.
// Gap files are regenerated weekly by weekly-refresh.yml, which will
// reintroduce these targets, so re-run this after a regeneration until the
// ingester itself grows a proper per-target cooldown.
//
// Usage:
//   node scripts/pruneGapTargetsInBacklog.js                  # dry-run, all gap files
//   node scripts/pruneGapTargetsInBacklog.js --apply
//   node scripts/pruneGapTargetsInBacklog.js --apply --file=gap-width.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const APPLY = process.argv.includes("--apply");
const FILE_ARG = process.argv.find((a) => a.startsWith("--file="));
const FILES = FILE_ARG
  ? [FILE_ARG.split("=")[1]]
  : ["gap-width.json", "gap-depth.json", "gap-manual.json", "gap-priority.json", "gap-featured.json"];

const targetKey = (t) => `${t.name}\u0001${t.publisher}\u0001${t.year}`;

const backlogPath = path.join(ROOT, "needs_volume_id.json");
if (!fs.existsSync(backlogPath)) {
  console.error("needs_volume_id.json not found — nothing to prune against.");
  process.exit(1);
}
const backlog = JSON.parse(fs.readFileSync(backlogPath, "utf8"));
const backlogSet = new Set(backlog.map(targetKey));
console.log(`needs_volume_id.json: ${backlog.length} entries\n`);

let totalRemoved = 0;

for (const file of FILES) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) continue;

  const targets = JSON.parse(fs.readFileSync(p, "utf8"));
  const kept = targets.filter((t) => !backlogSet.has(targetKey(t)));
  const removed = targets.length - kept.length;
  totalRemoved += removed;

  console.log(`${file}: ${targets.length} -> ${kept.length} (${removed} already in backlog)`);

  // gap-pinned.json is deliberately excluded from FILES: its entries carry an
  // explicit volume_id, which is precisely the disambiguation the backlog was
  // waiting for, so those should keep being attempted.
  if (removed > 0 && APPLY) {
    fs.writeFileSync(p, `${JSON.stringify(kept, null, 2)}\n`);
  }
}

console.log(
  `\n${APPLY ? "Applied" : "[dry-run]"} — ${totalRemoved} target(s) ${APPLY ? "removed" : "would be removed"}.`
);
if (!APPLY && totalRemoved > 0) console.log("Re-run with --apply to write.");
