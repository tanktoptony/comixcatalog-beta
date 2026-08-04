// generateEngineeringReport.js — git-native, on-demand engineering report.
//
// Lighter cousin of the one-off PDF report written by hand on 2026-08-03
// (reports/ComixCatalog-Daily-Report-2026-08-03.pdf): same idea (risk-tag
// recent commits, flag concurrent-edit collisions), but mechanical — no
// LLM narrative, no Supabase queries, just `git log` + path globs.
//
// Usage:
//   npm run report:engineering                  (default: last 24h)
//   npm run report:engineering -- --since=48h
//   npm run report:engineering -- --since=2026-08-03
//   npm run report:engineering -- --since="485a23e"   (a git ref)

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

// execFileSync (argv array, no shell) rather than execSync (shell string) —
// on Windows, execSync's default shell is cmd.exe, where `^` is an escape
// character and mangles git revision syntax like `<ref>^{commit}`.
function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

// --- args ---------------------------------------------------------------

const rawSinceArg = (process.argv.find((a) => a.startsWith("--since=")) || "--since=24h").slice(
  "--since=".length
);

// git's --since doesn't understand bare shorthand like "24h"/"2d" — it wants
// approxidate syntax ("24 hours ago"). Silently returns zero commits rather
// than erroring on an unparseable date, so this was a real bug (not just a
// style nit): translate the documented shorthand into what git actually
// accepts, rather than let it fail quiet-wrong.
const shorthandMatch = /^(\d+)([hd])$/.exec(rawSinceArg);
const sinceArg = shorthandMatch
  ? `${shorthandMatch[1]} ${shorthandMatch[2] === "h" ? "hours" : "days"} ago`
  : rawSinceArg;

// A ref (commit SHA / branch / tag) walks `<ref>..HEAD`; anything else is
// treated as a `git log --since=` date expression ("24h", "2026-08-03", ...).
let revRange;
let sinceLabel;
try {
  git(["rev-parse", "--verify", "--quiet", `${rawSinceArg}^{commit}`]);
  revRange = [`${rawSinceArg}..HEAD`];
  sinceLabel = `since ${rawSinceArg}`;
} catch {
  revRange = ["HEAD", `--since=${sinceArg}`];
  sinceLabel = `in the last ${rawSinceArg}`;
}

// --- risk classification -------------------------------------------------

const RISK_RULES = [
  {
    level: "CRITICAL",
    patterns: [
      /^src\/app\/api\/stripe\//,
      /^src\/lib\/stripe\.js$/,
      /^src\/app\/auth\//,
      /^src\/lib\/authServer\.js$/,
      /^src\/context\/AuthContext\.js$/,
      /^scripts\/migrations\//,
      /^\.github\/workflows\//,
    ],
  },
  {
    level: "HIGH",
    patterns: [
      /^src\/lib\/coverMatch\.js$/,
      /^src\/lib\/catalogLinkMatcher\.js$/,
      /^src\/lib\/titleMatch\.js$/,
      /^src\/lib\/coverPrice\.js$/,
      /^scripts\/.*(ingest|backfill|repair|sweep).*\.js$/i,
      /^src\/app\/api\//,
    ],
  },
  {
    level: "MEDIUM",
    patterns: [/^src\/app\//, /^src\/components\//],
  },
  {
    level: "LOW",
    patterns: [/^docs\//, /\.md$/i, /^public\//, /\.css$/i],
  },
];

const LEVEL_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function classifyFile(file) {
  for (const rule of RISK_RULES) {
    if (rule.patterns.some((p) => p.test(file))) return rule.level;
  }
  return "MEDIUM"; // unclassified paths default to a middle tier, not silently LOW
}

function commitRisk(files) {
  return files.reduce((worst, f) => {
    const level = classifyFile(f);
    return LEVEL_ORDER.indexOf(level) > LEVEL_ORDER.indexOf(worst) ? level : worst;
  }, "LOW");
}

// --- gather commits --------------------------------------------------------

const SEP = "\x1e"; // record separator, unlikely to appear in a commit message
// --first-parent walks only the mainline: a merge commit shows up once, not
// again for each individual commit it brought in (this repo's PR/worktree
// convention lands most changes as merges, not --no-merges squashes).
const log = git([
  "log",
  ...revRange,
  "--first-parent",
  `--format=%H${SEP}%an${SEP}%ai${SEP}%s`,
]).trim();

const commits = log
  ? log.split("\n").map((line) => {
      const [sha, author, date, subject] = line.split(SEP);
      // Diff against the first parent specifically (not `diff-tree -r`, which
      // shows nothing for a merge commit unless told how to handle multiple
      // parents) — this is "what did landing this commit/merge change on
      // mainline," which works the same way for a regular commit too.
      const files = git(["diff", "--name-only", `${sha}^`, sha])
        .trim()
        .split("\n")
        .filter(Boolean);
      return { sha: sha.slice(0, 7), author, date, subject, files, risk: commitRisk(files) };
    })
  : [];

// --- collision detection ---------------------------------------------------
// Flag a file touched by two-plus commits within a short window of each
// other. Deliberately NOT grouped by author: 2026-08-03's two concurrent
// sessions both committed under the same git identity ("Anthony Jarina" —
// see the human-written report from that night), so author-based grouping
// would never fire on the exact case this is meant to catch. Time-proximity
// is the only signal git log actually gives us for "this might have been
// two things happening at once."
//
// Caveat this can't paper over: the real 2026-08-03 incident was a
// *working-tree* race (one session's uncommitted edits colliding with
// another session's `git pull`), resolved via stash before anything was
// committed — so it left no trace in git log at all. This is a safety net
// for the next incident, not a retroactive detector for that one. `git
// status` before any pull/merge remains the actual mitigation.

const COLLISION_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

const fileTouches = new Map(); // file -> [{sha, author, date}]
for (const c of commits) {
  for (const f of c.files) {
    if (!fileTouches.has(f)) fileTouches.set(f, []);
    fileTouches.get(f).push({ sha: c.sha, author: c.author, date: c.date });
  }
}

const collisions = [];
for (const [file, touches] of fileTouches) {
  if (touches.length < 2) continue;
  const sorted = [...touches].sort((a, b) => new Date(a.date) - new Date(b.date));
  for (let i = 1; i < sorted.length; i++) {
    const gapMs = new Date(sorted[i].date) - new Date(sorted[i - 1].date);
    if (gapMs <= COLLISION_WINDOW_MS) {
      collisions.push({ file, touches: sorted });
      break;
    }
  }
}

// --- render ------------------------------------------------------------

const lines = [];
lines.push(`# Engineering report — ${sinceLabel}`);
lines.push("");
lines.push(`Generated ${new Date().toISOString()} by \`scripts/generateEngineeringReport.js\`.`);
lines.push("");

if (commits.length === 0) {
  lines.push(`No commits found ${sinceLabel}. Nothing to report.`);
} else {
  lines.push(`## Commits (${commits.length})`);
  lines.push("");
  lines.push("| Risk | Commit | Author | Subject |");
  lines.push("|---|---|---|---|");
  for (const c of commits) {
    lines.push(`| ${c.risk} | \`${c.sha}\` | ${c.author} | ${c.subject} |`);
  }
  lines.push("");

  const critHigh = commits.filter((c) => c.risk === "CRITICAL" || c.risk === "HIGH");
  if (critHigh.length) {
    lines.push("## Critical/high-risk commits — detail");
    lines.push("");
    for (const c of critHigh) {
      lines.push(`### \`${c.sha}\` — ${c.subject} (${c.risk})`);
      lines.push(`- Author: ${c.author}, ${c.date}`);
      lines.push(`- Files: ${c.files.join(", ")}`);
      lines.push("");
    }
  }

  lines.push("## Concurrent-edit risk");
  lines.push("");
  lines.push(
    `_Files touched by 2+ commits within ${COLLISION_WINDOW_MS / 3600000}h of each other. This can't see uncommitted working-tree races (the actual shape of the 2026-08-03 near-miss) — only overlaps that already made it into git log. Run \`git status\` before any pull/merge regardless._`
  );
  lines.push("");
  if (collisions.length === 0) {
    lines.push("None detected in this window.");
  } else {
    for (const { file, touches } of collisions) {
      lines.push(`- \`${file}\``);
      for (const t of touches) {
        lines.push(`  - \`${t.sha}\` ${t.author}, ${t.date}`);
      }
    }
  }
}

lines.push("");
const report = lines.join("\n");

console.log(report);

const reportsDir = path.join(repoRoot, "reports");
mkdirSync(reportsDir, { recursive: true });
const outFile = path.join(reportsDir, `engineering-report-${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(outFile, report);
console.error(`\nWritten to ${path.relative(repoRoot, outFile)}`);
