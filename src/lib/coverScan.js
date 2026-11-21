import { baseIssueNumber, publishersCompatible } from "./coverMatch.js";
import { isOwnedStatus } from "./collectionStatus.js";

export function ownedCopiesFor(rows, gcdIssueId) {
  return (rows ?? [])
    .filter((row) => Number(row.gcd_issue_id) === Number(gcdIssueId) && isOwnedStatus(row.status))
    .map(({ id, copy_number, variant_label }) => ({ id, copy_number, variant_label }))
    .sort((a, b) => Number(a.copy_number ?? 1) - Number(b.copy_number ?? 1));
}

export function ownedCopyLabel(copy) {
  const label = `Copy ${copy.copy_number ?? 1}`;
  return copy.variant_label ? `${label} (${copy.variant_label})` : label;
}

// A 0.6 Jaccard threshold requires most distinct title words to agree while
// allowing a small subtitle difference. Reordered titles score 1; the known
// false match "Batman Immortal Legend" / "Batman Urban Legends" scores 0.2.
export const COVER_TITLE_SIMILARITY_THRESHOLD = 0.6;

export function titleTokens(value) {
  const tokens = String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens[0] === "the") tokens.shift();
  return [...new Set(tokens)];
}

export function titleSimilarity(left, right) {
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

export const COVER_SCAN_MODEL = "claude-opus-5-5";
export function coverScanConfigStatus(env = process.env) {
  return env.ANTHROPIC_API_KEY ? null : { status: 503, error: "Cover scanning is temporarily unavailable." };
}
export function coverScanModelFailure() {
  return { status: 502, outcome: "error", error: "We could not read that cover. Please try another photo." };
}
export const COVER_SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    series_title: { type: "string" }, issue_number: { type: "string" },
    publisher: { type: "string" }, cover_year: { type: ["integer", "null"] },
    cover_month: { type: ["integer", "null"] },
    cover_price: { type: ["string", "null"] },
    edition_clues: { type: "array", items: { type: "string" } },
    other_text: { type: "string" }, is_comic_cover: { type: "boolean" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["series_title", "issue_number", "publisher", "cover_year", "cover_month", "cover_price", "edition_clues", "other_text", "is_comic_cover", "confidence"],
};

export function parseCoverExtraction(message) {
  if (message?.stop_reason === "refusal") throw new Error("The cover could not be read safely.");
  if (message?.stop_reason === "max_tokens") throw new Error("The cover response was incomplete.");
  const text = message?.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("The cover response was empty.");
  const value = JSON.parse(text);
  for (const key of COVER_SCAN_SCHEMA.required) if (!(key in value)) throw new Error(`Missing extracted field: ${key}`);
  if (!["low", "medium", "high"].includes(value.confidence) || typeof value.is_comic_cover !== "boolean") throw new Error("Invalid cover response.");
  // The API's structured outputs reject minimum/maximum on integers (a live
  // scan 400'd on it 2026-10-06), so range checks live here instead. An
  // out-of-range month or year is a misread, not a reason to fail the scan.
  if (!(Number.isInteger(value.cover_month) && value.cover_month >= 1 && value.cover_month <= 12)) value.cover_month = null;
  if (!(Number.isInteger(value.cover_year) && value.cover_year >= 1930 && value.cover_year <= new Date().getFullYear() + 1)) value.cover_year = null;
  return value;
}

export function scanLimit(isPro) {
  void isPro;
  return 100;
}
// A scan of a book we don't have is a contribution, not usage: the first
// FREE_NOT_IN_CATALOG of those each day don't count toward the daily limit.
// Past that they count like any scan, which bounds the AI cost if someone
// scripts it.
export const FREE_NOT_IN_CATALOG = 30;
export function scanUsage(counted, notInCatalog) {
  return counted + Math.max(0, notInCatalog - FREE_NOT_IN_CATALOG);
}
export function scanWasFree(outcome, notInCatalogBefore) {
  return outcome === "not_in_catalog" && notInCatalogBefore < FREE_NOT_IN_CATALOG;
}
export function capStatus(used, isPro) {
  const limit = scanLimit(isPro);
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
}

function yearOf(row) {
  const match = String(row.key_date ?? row.publication_date ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}
function editionScore(issueNumber, clues = []) {
  const haystack = String(issueNumber ?? "").toLowerCase();
  return clues.reduce((score, clue) => score + (haystack.includes(String(clue).toLowerCase()) ? 15 : 0), 0);
}

export function rankCoverCandidates(extracted, seriesRows, issueRows) {
  const base = baseIssueNumber(extracted.issue_number);
  return issueRows
    .filter((issue) => base && baseIssueNumber(issue.issue_number) === base)
    .map((issue) => {
      const series = seriesRows.find((row) => Number(row.gcd_id) === Number(issue.series_gcd_id));
      if (!series) return null;
      const titleScore = titleSimilarity(series.title, extracted.series_title);
      if (titleScore < COVER_TITLE_SIMILARITY_THRESHOLD) return null;
      const inSpan = extracted.cover_year != null && Number(series.year_start_cached) <= extracted.cover_year && Number(series.year_end_cached ?? 9999) >= extracted.cover_year;
      const publisher = extracted.publisher && publishersCompatible(extracted.publisher, series.resolved_publisher_cached);
      const issueYear = yearOf(issue);
      const yearDelta = extracted.cover_year != null && issueYear != null ? Math.abs(extracted.cover_year - issueYear) : 99;
      return { issue, series, titleScore, score: titleScore * 100 + (inSpan ? 45 : 0) + (publisher ? 35 : 0) + Math.max(0, 20 - yearDelta * 5) + editionScore(issue.issue_number, extracted.edition_clues) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(a.issue.gcd_id) - Number(b.issue.gcd_id));
}

export function coverScanOutcome(extracted, candidates) {
  if (!extracted.is_comic_cover) return "not_a_comic";
  if (candidates.length) return "matched";
  return extracted.confidence === "low" ? "not_a_comic" : "not_in_catalog";
}

// Words that appear in most variant names and say nothing about which one.
const GENERIC_VERSION_WORDS = new Set(["cover", "covers", "variant", "variants", "edition", "the", "a", "an", "of", "and", "by", "art", "retailer", "incentive", "ratio"]);

const ORDINALS = { "1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth", "5th": "fifth", "6th": "sixth" };
const clueTokens = (value) => titleTokens(value).map((word) => ORDINALS[word] ?? word);

function versionWords(name) {
  return clueTokens(name).filter((word) => word.length > 1 && !GENERIC_VERSION_WORDS.has(word) && !/^\d+$/.test(word));
}

// How many words of a version's name the scan read on the cover (artist
// signature, "virgin", "foil"...). A version only counts when every one of
// its words was read: "Mark Brooks Virgin Cover" needs "virgin" too, so a
// trade-dress Brooks cover never lands on the virgin.
export function versionClueMatch(versionName, extracted) {
  const words = versionWords(versionName);
  if (!words.length) return 0;
  // Nearly every US cover prints its Canadian and UK prices, so a price
  // variant counts only when a clue calls the copy that variant or edition.
  if (PRICE_VERSION.test(versionName) && !assertedClueParts(extracted).some((part) => PRICE_VARIANT_CLAIM.test(part))) return 0;
  const read = assertedClueWords(extracted);
  return words.every((word) => read.has(word)) ? words.length : 0;
}
const PRICE_VERSION = /\b(canadian|canada|uk|pence|price)\b/i;
const PRICE_VARIANT_CLAIM = /\b(canadian|canada|uk|pence|price)\b.*\b(variant|edition)\b/i;

// The model hedges: "(direct/newsstand not determinable; no barcode
// visible)", "barcode suggests newsstand". The main text of a clue and each
// parenthetical are judged apart, so "Virgin variant cover (no trade dress)"
// still says virgin. A part that hedges or denies says nothing, and when the
// clues assert both direct and newsstand, neither counts.
const HEDGE = /\b(not|no|unclear|unknown|undetermin\w*|indetermin\w*|cannot|can't|unable|possibly|probably|perhaps|maybe|likely|might|may|could|appears?|seems?|looks like|resembles?|suggest\w*|consistent|style|or)\b/i;
function assertedClueParts(extracted) {
  return [...(extracted?.edition_clues ?? []), extracted?.other_text ?? ""]
    .flatMap((clue) => {
      const text = String(clue ?? "");
      const inner = [...text.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
      return [text.replace(/\([^)]*\)/g, " "), ...inner];
    })
    .filter((part) => part.trim() && !HEDGE.test(part));
}
export function assertedClueWords(extracted) {
  const words = new Set(clueTokens(assertedClueParts(extracted).join(" ")));
  if (words.has("direct") && words.has("newsstand")) { words.delete("direct"); words.delete("newsstand"); }
  return words;
}

export function versionName(issue) {
  const name = String(issue?.variant_name ?? "").trim();
  const base = Number(issue?.base_gcd_issue_id ?? issue?.variant_of_gcd_id ?? issue?.gcd_id);
  return name && base !== Number(issue?.gcd_id) ? name : "Regular edition";
}

// One result per issue. Inside an issue, the version the cover clues name
// wins when exactly one version fits best; otherwise the first-ranked one,
// moved to a version with a cover if it has none. Every version stays on
// the result so the collector can say which one they have.
export function collapseCoverPrintings(ranked, covers = new Map(), extracted = null) {
  const groups = new Map();
  for (const candidate of ranked ?? []) {
    const base = baseIssueNumber(candidate.issue.issue_number);
    const key = `${candidate.issue.series_gcd_id}:${base}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const picked = [...groups.values()].map((members) => {
    const scored = members.map((member) => ({ member, clue: versionClueMatch(versionName(member.issue), extracted) }));
    const best = Math.max(0, ...scored.map((row) => row.clue));
    const leaders = scored.filter((row) => row.clue === best && best > 0);
    let choice = members[0];
    if (leaders.length === 1) choice = leaders[0].member;
    else {
      // With no clue, the regular edition is the default when it is the one
      // unnamed version; the collector can still pick another.
      const regulars = members.filter((member) => versionName(member.issue) === "Regular edition");
      if (regulars.length === 1 && members.length > 1) choice = regulars[0];
      else for (const member of members) {
        const memberHasCover = covers.has(Number(member.issue.gcd_id));
        const choiceHasCover = covers.has(Number(choice.issue.gcd_id));
        if (memberHasCover && !choiceHasCover) choice = member;
      }
    }
    const versions = [...members]
      .sort((a, b) => (versionName(a.issue) === "Regular edition" ? -1 : 0) - (versionName(b.issue) === "Regular edition" ? -1 : 0) || Number(a.issue.gcd_id) - Number(b.issue.gcd_id))
      .map((member) => ({ gcd_issue_id: Number(member.issue.gcd_id), name: versionName(member.issue) }));
    return { ...choice, versionPicked: leaders.length === 1, versions };
  });
  return picked.sort((a, b) => b.score - a.score || Number(a.issue.gcd_id) - Number(b.issue.gcd_id));
}

// A scan result's issue or any version listed under it.
export function scanResultHasIssue(candidates, gcdIssueId) {
  const id = Number(gcdIssueId);
  return (candidates ?? []).some((row) => Number(row.gcd_issue_id) === id || (row.versions ?? []).some((version) => Number(version.gcd_issue_id) === id));
}
