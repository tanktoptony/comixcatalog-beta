// A ratchet on the error-swallowing shapes that keep producing outages here.
//
// Three incidents in one week (#103, #104, #114) were the same mistake in
// three places: the reason for a failure was in hand, got discarded, and a
// guess was printed instead. Fixing those three does nothing to stop the
// fourth, because nothing prevents the shape from being written again — I
// wrote one of them myself, today, in instagramBot.js.
//
// This counts the known-bad shapes and compares against a committed
// baseline. Adding one fails CI. Removing one and not updating the baseline
// also fails, so the number can only go down deliberately.
//
// It is a ratchet, NOT a cleanup: the existing occurrences stay, recorded,
// and get burned down when someone is already in that file. Blocking every
// PR until 22 call sites are refactored would just get the check deleted.
//
// Usage:
//   node scripts/auditErrorHandling.js            # check against baseline
//   node scripts/auditErrorHandling.js --update   # accept the current counts

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", ".error-handling-baseline.json");
const UPDATE = process.argv.includes("--update");

const PATTERNS = [
  {
    id: "supabase-query-ignores-error",
    // `const { data } = await supabase...` — a failed query returns
    // data: null, which is indistinguishable from "no rows matched". This is
    // how a database outage becomes "this series has no covers".
    why: "a failed query looks exactly like an empty result",
    fix: "destructure { data, error } and check it, or use unwrap() from scripts/lib/describeError.js",
    dirs: ["scripts", "src"],
    ext: [".js", ".jsx"],
    test: (line) => /const\s*\{\s*data\s*\}\s*=\s*await\s+supabase/.test(line),
  },
  {
    id: "invented-error-text",
    // The || chain that turned a real PGRST002 into "unknown error".
    why: "substitutes a guess for the error fields that were already in hand",
    fix: "use describeError() from scripts/lib/describeError.js",
    dirs: ["scripts", "src"],
    ext: [".js", ".jsx"],
    test: (line) =>
      /["'`]unknown error["'`]/.test(line) ||
      /\berror\.message\s*\|\|\s*error\.code\b/.test(line) ||
      /\berr\.message\s*\|\|\s*err\.code\b/.test(line),
  },
  {
    id: "empty-catch",
    why: "discards the failure entirely, with no record that anything went wrong",
    fix: "log describeError(err), or comment why swallowing is correct here",
    dirs: ["scripts", "src"],
    ext: [".js", ".jsx"],
    test: (line) => /catch\s*(\([^)]*\))?\s*\{\s*\}/.test(line),
  },
  {
    id: "blanket-continue-on-error",
    // Legitimate for "one ingest lane failing shouldn't kill the other six",
    // but it cannot tell an expected exit from a hard crash. gcd-series-format-
    // sync.yml shows the alternative: translate only the expected code to
    // success and let everything else go red.
    why: "cannot distinguish an expected non-zero exit from a real failure",
    fix: "wrap the step and translate only the expected exit code, as gcd-series-format-sync.yml does",
    dirs: [".github/workflows"],
    ext: [".yml", ".yaml"],
    test: (line) => /^\s*continue-on-error:\s*true\s*$/.test(line),
  },
];

function walk(dir, ext, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".next")) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, ext, out);
    else if (ext.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

const counts = {};
const hits = {};
for (const p of PATTERNS) {
  const files = p.dirs.flatMap((d) => walk(d, p.ext));
  const found = [];
  for (const file of files) {
    // This audit names every pattern it looks for, so it would flag itself
    // on every rule. Test files are skipped for the same reason: the tests
    // for describeError() assert that we never PRINT "unknown error", which
    // means the string legitimately appears in the assertion.
    if (file.endsWith("auditErrorHandling.js")) continue;
    if (/\.test\.(js|jsx)$/.test(file)) continue;
    const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (p.test(line)) found.push(`${file.replace(/\\/g, "/")}:${i + 1}`);
    });
  }
  counts[p.id] = found.length;
  hits[p.id] = found;
}

// Keep the whole baseline object: `counts` drives pass/fail, `hits` is what
// lets the failure name the NEW line instead of reprinting all 41 existing
// ones. Collapsing this to `.counts` made the report useless noise — which
// would have taught whoever hit it to ignore the check.
let baselineCounts = {};
let baselineHits = {};
try {
  const parsed = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  baselineCounts = parsed.counts ?? {};
  baselineHits = parsed.hits ?? {};
} catch {
  if (!UPDATE) {
    console.error(`No baseline at ${BASELINE}. Run with --update to create it.`);
    process.exit(1);
  }
}

if (UPDATE) {
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify({ updated: new Date().toISOString().slice(0, 10), counts, hits }, null, 2)}\n`
  );
  console.log("Baseline updated:");
  for (const p of PATTERNS) console.log(`  ${String(counts[p.id]).padStart(3)}  ${p.id}`);
  process.exit(0);
}

let failed = false;
for (const p of PATTERNS) {
  const now = counts[p.id];
  const was = baselineCounts[p.id] ?? 0;
  const delta = now - was;
  const flag = delta > 0 ? "WORSE" : delta < 0 ? "better" : "same";
  console.log(`  ${String(now).padStart(3)} (baseline ${String(was).padStart(3)}, ${flag})  ${p.id}`);
  if (delta > 0) {
    failed = true;
    const added = hits[p.id].filter((h) => !(baselineHits[p.id] ?? []).includes(h));
    console.error(`      ${p.why}`);
    console.error(`      fix: ${p.fix}`);
    for (const a of added.slice(0, 10)) console.error(`      + ${a}`);
  }
}

if (failed) {
  console.error(
    "\nFAIL: new error-swallowing code. These shapes caused three production " +
      "incidents in one week — see scripts/lib/describeError.js for why.\n" +
      "If the new occurrence is genuinely correct, say so in the commit and " +
      "run: node scripts/auditErrorHandling.js --update"
  );
  process.exit(1);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`\nOK: ${total} known occurrences, none added.`);
