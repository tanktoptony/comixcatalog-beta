// Retry a Supabase query that failed for a reason that will probably not
// happen again a second later.
//
// Why this exists, measured 2026-09-25 over the last 100 hourly runs:
//
//   scripts/checkCoverIngestHealth.js --mode=stall   retries 4x   passes
//   scripts/generateNightlyCoverReport.js            retries 4x   passes
//   scripts/snapshotCollectionValue.js               retries 4x   passes
//   scripts/repairAllCoverSeriesLinks.js             no retry     fails
//
// The last one is the whole residual failure rate of the cover-ingest
// workflow. It throws on the first query error, which kills the health check
// that spawned it and turns the run red — after the ingest itself has
// already succeeded and written new covers. 2026-09-25 07:00 UTC is the
// example: the run reported "OK: ingest pipeline is producing new covers",
// then failed because one page of a follow-up query hit a statement timeout.
//
// A note on what is NOT transient. The three implementations this replaces
// all list PGRST116 as retryable. PGRST116 is "JSON object requested,
// multiple (or no) rows returned" — a .single() against a row count that is
// not one. That is a fact about the data and it will be just as true after
// three backoffs, so retrying it only spends 12 seconds arriving at the same
// error. It is deliberately absent below.

// Postgres SQLSTATEs that mean "the server was busy or went away", plus the
// Node socket errors that mean the same thing one layer down.
const TRANSIENT_CODES = new Set([
  "57014", // canceling statement due to statement timeout
  "57P01", // admin shutdown / terminating connection
  "53300", // too many connections
  "08000", // connection exception
  "08003", // connection does not exist
  "08006", // connection failure
  "40001", // serialization failure
  "40P01", // deadlock detected
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

export function isTransient(error) {
  if (!error) return false;
  if (TRANSIENT_CODES.has(String(error.code || ""))) return true;
  const msg = String(error.message || "").toLowerCase();
  if (!msg && !error.code) return true; // an empty error object is a hiccup, not a verdict
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("socket hang up") ||
    msg.includes("connection closed")
  );
}

export const DEFAULT_BACKOFF_MS = [1000, 3000, 8000];

// `thunk` returns a Supabase result ({ data, error }). Resolves with `data`,
// or throws the error that finally stuck.
//
// `sleep` and `log` are injectable so the tests can exercise the backoff
// path without actually waiting 12 seconds for it.
export async function withRetry(
  label,
  thunk,
  { maxAttempts = 4, backoff = DEFAULT_BACKOFF_MS, sleep, log = console.error } = {}
) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await thunk();
    if (!error) return data;
    lastError = error;

    // A permanent error fails now. Backing off three times before reporting
    // a schema mistake just makes the log harder to read.
    if (!isTransient(error) || attempt === maxAttempts) throw error;

    const ms = backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 8000;
    log(
      `  ⚠ ${label} transient error (attempt ${attempt}/${maxAttempts}): ` +
        `${error.message || error.code || "unknown"} — retrying in ${ms}ms`
    );
    await wait(ms);
  }

  throw lastError;
}
