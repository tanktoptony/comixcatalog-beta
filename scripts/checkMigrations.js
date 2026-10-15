import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "scripts", "migrations");

export const HISTORICAL_DUPLICATE_IDS = new Set([
  "0037", // Applied records: publisher-sync backfill and US-market publisher data.
  "0067", // Applied records: GCD issue editions and series-card cover selection.
  "0068", // Applied records: search-term cache and marketplace seller accounts.
]);

const LARGE_TABLES = new Set([
  "series",
  "gcd_series",
  "gcd_issues",
  "gcd_stories",
  "issue_creators",
  "user_collections",
  "canonical_covers",
  "listings",
]);

const MIGRATION_PATH = /^scripts\/migrations\/([^/]+\.sql)$/i;
const MIGRATION_NAME = /^(\d+[a-z]?)_.+\.sql$/i;
const ALLOW_OVERRIDE = /^--[ \t]*migration-check:[ \t]*allow[ \t]+[^ \t\r\n].*$/im;
const ROLLBACK = /^--\s*Rollback:\s*(?:\S.*)?$/im;

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

export function migrationId(filePath) {
  const name = path.basename(filePath);
  return MIGRATION_NAME.exec(name)?.[1]?.toLowerCase() ?? null;
}

export function findDuplicateMigrationErrors(fileNames) {
  const byId = new Map();
  for (const fileName of fileNames) {
    const id = migrationId(fileName);
    if (!id) continue;
    const names = byId.get(id) ?? [];
    names.push(path.basename(fileName));
    byId.set(id, names);
  }

  const errors = [];
  for (const [id, names] of byId) {
    if (names.length > 1 && !HISTORICAL_DUPLICATE_IDS.has(id)) {
      errors.push(`duplicate migration id ${id}: ${names.sort().join(", ")}`);
    }
  }
  return errors;
}

function unqualifiedTableName(identifier) {
  return identifier
    .replaceAll('"', "")
    .split(".")
    .at(-1)
    .toLowerCase();
}

export function checkMigrationContent(filePath, sql) {
  const errors = [];
  if (!ROLLBACK.test(sql)) {
    errors.push(`${filePath}: missing -- Rollback: block`);
  }

  if (ALLOW_OVERRIDE.test(sql)) return errors;

  const createIndex = /\bcreate\s+(?:unique\s+)?index\s+(?!concurrently\b)[\s\S]*?\bon\s+((?:"?[\w]+"?\.)?"?[\w]+"?)/gi;
  for (const match of sql.matchAll(createIndex)) {
    const table = unqualifiedTableName(match[1]);
    if (LARGE_TABLES.has(table)) {
      errors.push(`${filePath}: CREATE INDEX on large table ${table} must use CONCURRENTLY`);
    }
  }

  // [^;]*? keeps each match inside one statement, so a later statement on a
  // small table is never blamed on an earlier large-table ALTER.
  const alterType = /\balter\s+table\s+(?:if\s+exists\s+)?((?:"?[\w]+"?\.)?"?[\w]+"?)[^;]*?\balter\s+column\s+"?[\w]+"?\s+(?:set\s+data\s+)?type\b/gi;
  for (const match of sql.matchAll(alterType)) {
    const table = unqualifiedTableName(match[1]);
    if (LARGE_TABLES.has(table)) {
      errors.push(`${filePath}: ALTER COLUMN TYPE is blocked on large table ${table}`);
    }
  }

  // A bulk UPDATE rewrites every touched row; on a big table that drains the
  // Disk IO budget (2026-10-05 outage). Backfills belong in a batched script.
  const bulkUpdate = /\bupdate\s+(?:only\s+)?((?:"?[\w]+"?\.)?"?[\w]+"?)\s+(?:as\s+\w+\s+)?set\b/gi;
  for (const match of sql.matchAll(bulkUpdate)) {
    const table = unqualifiedTableName(match[1]);
    if (LARGE_TABLES.has(table)) {
      errors.push(`${filePath}: UPDATE on large table ${table} belongs in a batched script, not a migration`);
    }
  }

  return errors;
}

export function checkMigrations({ allFiles, changedFiles, readFile = readFileSync }) {
  const errors = findDuplicateMigrationErrors(allFiles);
  for (const filePath of changedFiles) {
    const normalized = normalizePath(filePath);
    if (!MIGRATION_PATH.test(normalized)) continue;
    const absolute = path.resolve(repoRoot, normalized);
    errors.push(...checkMigrationContent(normalized, readFile(absolute, "utf8")));
  }
  return errors;
}

function changedMigrationFiles(baseRef) {
  try {
    return execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`, "--", "scripts/migrations/*.sql"],
      { cwd: repoRoot, encoding: "utf8" },
    ).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    console.error(`Could not compare migrations against ${baseRef}: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

function main() {
  const allFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => `scripts/migrations/${name}`);
  const args = process.argv.slice(2);
  const baseArg = args.find((arg) => arg.startsWith("--base="));
  const explicitFiles = args.filter((arg) => !arg.startsWith("--base="));
  const changedFiles = explicitFiles.length
    ? explicitFiles
    : changedMigrationFiles(baseArg?.slice("--base=".length) || "origin/main");
  if (changedFiles === null) return;

  const errors = checkMigrations({ allFiles, changedFiles });
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Migration check passed (${allFiles.length} records, ${changedFiles.length} changed).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
