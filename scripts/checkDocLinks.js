// checkDocLinks.js — walk every tracked Markdown file and verify relative
// links point at files that actually exist. No external deps, no network
// calls (http(s) links and #-only anchors are skipped, not fetched).
//
// Usage: node scripts/checkDocLinks.js
// Exit code 1 if any broken relative link is found.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const repoRoot = path.resolve(import.meta.dirname, "..");

// --cached (tracked) + --others --exclude-standard (untracked, not gitignored)
// so brand-new docs get checked before their first commit.
const trackedMd = execSync("git ls-files --cached --others --exclude-standard", {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter((f) => f.toLowerCase().endsWith(".md"));

const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

// A link into a gitignored path (e.g. reports/) is never wrong by itself —
// those files are deliberately local-only and will never exist in a fresh
// CI checkout no matter who's touching the repo. Confirmed 2026-08-05:
// docs/README.md's link to reports/ComixCatalog-Formal-Launch-Plan.pdf
// failed every single PR's docs:check for this reason, unrelated to any
// PR's own diff.
function isGitignored(absPath) {
  try {
    execSync(`git check-ignore -q "${absPath}"`, { cwd: repoRoot });
    return true; // exit 0 = ignored
  } catch {
    return false; // exit 1 = not ignored (still broken)
  }
}

let brokenCount = 0;

for (const relFile of trackedMd) {
  const absFile = path.join(repoRoot, relFile);
  const content = readFileSync(absFile, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    let match;
    linkPattern.lastIndex = 0;
    while ((match = linkPattern.exec(line))) {
      let target = match[1].trim();

      // Skip external links, mailto, and pure-anchor links.
      if (/^([a-z]+:)?\/\//i.test(target) || target.startsWith("mailto:") || target.startsWith("#")) {
        continue;
      }

      // Strip a trailing #anchor before resolving the file path.
      const hashIdx = target.indexOf("#");
      if (hashIdx !== -1) target = target.slice(0, hashIdx);
      if (!target) continue;

      const resolved = path.resolve(path.dirname(absFile), target);
      if (!existsSync(resolved) && !isGitignored(resolved)) {
        console.error(`${relFile}:${idx + 1}  broken link -> ${match[1]}`);
        brokenCount++;
      }
    }
  });
}

if (brokenCount > 0) {
  console.error(`\n${brokenCount} broken relative link(s) found.`);
  process.exit(1);
} else {
  console.log(`OK — checked ${trackedMd.length} Markdown files, no broken relative links.`);
}
