// Backfill accepted issue_printings rows from a GCD SQLite data dump.
//
// Usage (dry-run is the default):
//   node scripts/backfillGcdBarcodes.js --gcd-db=/path/to/gcd.sqlite
//   node scripts/backfillGcdBarcodes.js --gcd-db=/path/to/gcd.sqlite --limit=10000
//   node scripts/backfillGcdBarcodes.js --gcd-db=/path/to/gcd.sqlite --apply

import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { catalogBarcodeRow } from "./lib/gcdBarcodes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, value] = arg.slice(2).split("=");
  return [key, value ?? true];
}));
const APPLY = Boolean(args.apply);
const dbPath = args["gcd-db"] ?? process.env.GCD_SQLITE_PATH;
const limit = args.limit == null ? Infinity : Number(args.limit);
const BATCH_SIZE = 500;
const PAUSE_MS = Number(args.pause ?? 250);

if (!dbPath) throw new Error("Provide --gcd-db=/path/to/gcd.sqlite or set GCD_SQLITE_PATH");
if (!Number.isInteger(limit) && limit !== Infinity || limit < 0) throw new Error("--limit must be a non-negative integer");
if (!Number.isFinite(PAUSE_MS) || PAUSE_MS < 0) throw new Error("--pause must be a non-negative number");
if (args.apply && args["dry-run"]) throw new Error("Choose either --apply or --dry-run, not both");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function findIssueSource(db) {
  const tables = db.prepare("select name from sqlite_master where type = 'table'").all().map((row) => row.name);
  for (const table of ["gcd_issue", "issue"]) {
    if (!tables.includes(table)) continue;
    const columns = db.prepare(`pragma table_info(${quoteIdentifier(table)})`).all().map((row) => row.name);
    const id = columns.includes("id") ? "id" : columns.includes("gcd_id") ? "gcd_id" : null;
    if (id && columns.includes("barcode")) return { table, id };
  }
  throw new Error("GCD SQLite dump must contain gcd_issue (or issue) with id/gcd_id and barcode columns");
}

function chunks(values, size) {
  const output = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

async function existingCatalogKeys(rows) {
  const found = new Set();
  const ids = [...new Set(rows.map((row) => row.gcd_issue_id))];
  for (const idsChunk of chunks(ids, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("issue_printings")
      .select("gcd_issue_id, upc")
      .in("gcd_issue_id", idsChunk)
      .eq("status", "accepted")
      .is("submitted_by", null);
    if (error) throw error;
    for (const row of data ?? []) found.add(`${row.gcd_issue_id}:${row.upc}`);
  }
  return found;
}

async function main() {
  const db = new Database(path.resolve(String(dbPath)), { readonly: true, fileMustExist: true });
  const source = findIssueSource(db);
  const sourceIssueCount = db.prepare(`select count(*) as count from ${quoteIdentifier(source.table)}`).get().count;
  const totalBarcodeCount = db.prepare(`select count(*) as count from ${quoteIdentifier(source.table)} where barcode is not null and trim(barcode) <> ''`).get().count;
  const cap = limit === Infinity ? "" : " limit @limit";
  const sql = `select ${quoteIdentifier(source.id)} as gcd_issue_id, barcode from ${quoteIdentifier(source.table)} where barcode is not null and trim(barcode) <> '' order by ${quoteIdentifier(source.id)}${cap}`;
  const rawRows = db.prepare(sql).all(limit === Infinity ? {} : { limit });
  db.close();

  const validByKey = new Map();
  let invalid = 0;
  for (const [index, raw] of rawRows.entries()) {
    if ((index + 1) % 10000 === 0) console.log(`Normalized ${index + 1} selected GCD barcodes...`);
    const row = catalogBarcodeRow(raw.gcd_issue_id, raw.barcode);
    if (!row) { invalid++; continue; }
    validByKey.set(`${row.gcd_issue_id}:${row.upc}`, row);
  }
  const validRows = [...validByKey.values()];
  const existing = await existingCatalogKeys(validRows);
  const pending = validRows.filter((row) => !existing.has(`${row.gcd_issue_id}:${row.upc}`));

  console.log(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`GCD source: ${path.resolve(String(dbPath))} (${source.table})`);
  console.log(`GCD source issues: ${sourceIssueCount}`);
  console.log(`Total GCD barcodes: ${totalBarcodeCount}`);
  if (rawRows.length !== totalBarcodeCount) console.log(`Selected by --limit: ${rawRows.length}`);
  console.log(`Valid unique issue/barcode pairs: ${validRows.length}`);
  console.log(`Invalid barcodes skipped: ${invalid}`);
  console.log(`Already present catalog rows: ${validRows.length - pending.length}`);
  console.log(`Would insert: ${pending.length}`);
  if (!APPLY || pending.length === 0) return;

  let inserted = 0;
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    const { error } = await supabase.from("issue_printings").insert(batch);
    if (error) throw error;
    inserted += batch.length;
    if (inserted % 10000 === 0 || inserted === pending.length) console.log(`Inserted ${inserted} / ${pending.length}`);
    if (index + BATCH_SIZE < pending.length) await sleep(PAUSE_MS);
  }
  console.log(`Done. Inserted ${inserted} accepted catalog rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
