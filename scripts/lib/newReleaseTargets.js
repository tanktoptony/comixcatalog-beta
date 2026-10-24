// Pure helpers for scripts/generateNewReleaseGap.js. Kept apart from the
// script so the date window, volume pick and retry throttle can be tested
// without Supabase or ComicVine.

import { US_PUBLISHER_ALLOWLIST } from "../../src/lib/publisher.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Exact-dated and ComicVine-confirmed releases are on sale now. Month-only
// GCD dates ("2026-11-00") are cover months, which run one to two months
// ahead of the on-sale date, so those books may not be on ComicVine yet.
export const PRIORITY = { dated: 0, comicvine: 1, month: 2 };

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthKey(date, offset) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  return `${isoDate(d).slice(0, 7)}-00`;
}

export function releaseWindow(today, { days = 28 } = {}) {
  const since = isoDate(new Date(today.getTime() - days * DAY_MS));
  return {
    since,
    through: isoDate(today),
    monthKeys: [monthKey(today, 0), monthKey(today, 1), monthKey(today, 2)],
  };
}

// GCD key_date is text: 'YYYY-MM-DD', or 'YYYY-MM-00' when only the month
// is known.
export function classifyKeyDate(keyDate, window) {
  const value = String(keyDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value.endsWith("-00")) return window.monthKeys.includes(value) ? "month" : null;
  return value >= window.since && value <= window.through ? "dated" : null;
}

// Same rule the search RPC applies (migration 0081).
export function isUsSeries(series) {
  if (series?.us_market === true) return true;
  if (series?.us_market === false) return false;
  return US_PUBLISHER_ALLOWLIST.includes(series?.resolved_publisher_cached);
}

// The ComicVine volume most of this series' covers came from. series.
// comicvine_volume_id is not trusted first: Radiant Black's points at the
// 8-issue trade volume while its 48 single-issue covers came from 133722.
export function pickVolumeId(coverRows, seriesPin) {
  const counts = new Map();
  for (const row of coverRows ?? []) {
    const id = Number(row?.comicvine_volume_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let best = null;
  for (const [id, count] of counts) {
    if (!best || count > best.count || (count === best.count && id > best.id)) best = { id, count };
  }
  if (best) return best.id;
  const pin = Number(seriesPin);
  return Number.isFinite(pin) && pin > 0 ? pin : null;
}

// Must match _done_key() in comicvine_api_to_supabase.py, an f-string, so a
// missing field renders as "None", not "null".
function pyStr(value) {
  return value == null ? "None" : String(value);
}

export function doneKey(target) {
  return `${pyStr(target.name)}\u0001${pyStr(target.publisher)}\u0001${pyStr(target.year)}`;
}

function processedAt(entry) {
  const stamp = entry && typeof entry === "object" ? entry.processed_at : entry;
  const time = Date.parse(stamp ?? "");
  return Number.isFinite(time) ? time : null;
}

// The lane runs hourly. A volume it just processed is left alone for a few
// hours (ComicVine often adds the image later the same day); after that its
// done-ledger key is expired so the lane looks again instead of waiting out
// the ingester's 7-day TTL.
export function applyRetryThrottle(targets, done, now, { retryHours = 6, monthRetryHours = 24 } = {}) {
  const due = [];
  const waiting = [];
  const expireKeys = [];
  for (const target of targets) {
    const key = doneKey(target);
    const last = processedAt(done?.[key]);
    const hours = target.priority === PRIORITY.month ? monthRetryHours : retryHours;
    if (last != null && now.getTime() - last < hours * 60 * 60 * 1000) {
      waiting.push(target);
      continue;
    }
    if (done && Object.hasOwn(done, key)) expireKeys.push(key);
    due.push(target);
  }
  return { due, waiting, expireKeys };
}

export function compareTargets(left, right) {
  return left.priority - right.priority
    || String(right.newest_release ?? "").localeCompare(String(left.newest_release ?? ""))
    || String(left.name).localeCompare(String(right.name));
}

function fold(prior, target) {
  prior.priority = Math.min(prior.priority, target.priority);
  if (String(target.newest_release ?? "") > String(prior.newest_release ?? "")) prior.newest_release = target.newest_release;
  prior.series_gcd_id ??= target.series_gcd_id;
  prior.missing = [...new Set([...prior.missing, ...target.missing])];
}

function titleYearKey(target) {
  return `${String(target.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}:${target.year ?? ""}`;
}

// One target per volume (or per series when no volume is known). The ingester
// fetches the whole volume, so every missing issue rides along. A series with
// no known volume folds into a same-title, same-year target that has one
// (GCD says "Marvel Comics" where the probe says "Marvel"), so it costs one
// direct volume fetch instead of an extra title search.
export function mergeTargets(targets) {
  const byKey = new Map();
  for (const target of targets) {
    const key = target.volume_id ? `v:${target.volume_id}` : `s:${target.series_gcd_id ?? doneKey(target)}`;
    const prior = byKey.get(key);
    if (prior) fold(prior, target);
    else byKey.set(key, { ...target, missing: [...target.missing] });
  }
  const withVolume = new Map();
  for (const target of byKey.values()) {
    if (target.volume_id && !withVolume.has(titleYearKey(target))) withVolume.set(titleYearKey(target), target);
  }
  const merged = [];
  for (const target of byKey.values()) {
    const home = target.volume_id ? null : withVolume.get(titleYearKey(target));
    if (home) fold(home, target);
    else merged.push(target);
  }
  return merged.sort(compareTargets);
}
