import fs from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const outPath = path.resolve("reports", "ComixCatalog-Formal-Launch-Plan.pdf");
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const pdf = await PDFDocument.create();
pdf.setTitle("ComixCatalog Formal Launch Plan");
pdf.setAuthor("ComixCatalog");
pdf.setSubject("Launch stabilization, data integrity, revenue, valuation, and marketing plan");

const regular = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const gold = rgb(0.78, 0.59, 0.20);
const navy = rgb(0.035, 0.065, 0.12);
const ink = rgb(0.12, 0.15, 0.20);
const muted = rgb(0.38, 0.42, 0.48);
const pale = rgb(0.95, 0.96, 0.97);
const white = rgb(1, 1, 1);
const pageW = 612;
const pageH = 792;
const margin = 52;
const contentW = pageW - margin * 2;
let page;
let y;
let pageNo = 0;

function addPage() {
  page = pdf.addPage([pageW, pageH]);
  pageNo++;
  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: white });
  page.drawRectangle({ x: 0, y: pageH - 11, width: pageW, height: 11, color: gold });
  if (pageNo > 1) {
    page.drawText("COMIXCATALOG  /  FORMAL LAUNCH PLAN", { x: margin, y: pageH - 32, size: 8, font: bold, color: muted });
    page.drawText(String(pageNo), { x: pageW - margin - 8, y: 26, size: 8, font: regular, color: muted });
  }
  y = pageH - (pageNo === 1 ? 54 : 54);
}

function ensure(height = 40) {
  if (y - height < 48) addPage();
}

function wrap(text, font, size, width) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else { if (line) lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(text, { size = 10, font = regular, color = ink, indent = 0, gap = 5, leading = size * 1.38 } = {}) {
  const lines = wrap(text, font, size, contentW - indent);
  ensure(lines.length * leading + gap);
  for (const line of lines) {
    page.drawText(line, { x: margin + indent, y, size, font, color });
    y -= leading;
  }
  y -= gap;
}

function heading(text, level = 1) {
  const size = level === 1 ? 18 : 13;
  ensure(size + 18);
  y -= level === 1 ? 8 : 4;
  page.drawText(text, { x: margin, y, size, font: bold, color: level === 1 ? navy : gold });
  y -= size + 9;
}

function bullet(text) {
  ensure(26);
  page.drawCircle({ x: margin + 4, y: y + 4, size: 2.2, color: gold });
  textBlock(text, { indent: 15, gap: 3 });
}

function callout(title, body) {
  const lines = wrap(body, regular, 10, contentW - 28);
  const h = 32 + lines.length * 14;
  ensure(h + 10);
  page.drawRectangle({ x: margin, y: y - h + 13, width: contentW, height: h, color: pale, borderColor: gold, borderWidth: 1 });
  page.drawText(title, { x: margin + 14, y: y - 3, size: 11, font: bold, color: navy });
  let ty = y - 21;
  for (const line of lines) {
    page.drawText(line, { x: margin + 14, y: ty, size: 10, font: regular, color: ink });
    ty -= 14;
  }
  y -= h + 8;
}

function progress(label, pct) {
  ensure(29);
  page.drawText(label, { x: margin, y, size: 9.5, font: bold, color: ink });
  page.drawText(`${pct}%`, { x: pageW - margin - 28, y, size: 9.5, font: bold, color: navy });
  y -= 10;
  page.drawRectangle({ x: margin, y, width: contentW, height: 7, color: pale });
  page.drawRectangle({ x: margin, y, width: contentW * pct / 100, height: 7, color: gold });
  y -= 16;
}

addPage();
page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH - 11, color: navy });
page.drawRectangle({ x: margin, y: 585, width: 58, height: 5, color: gold });
page.drawText("COMIXCATALOG", { x: margin, y: 700, size: 12, font: bold, color: gold });
page.drawText("Formal Launch Plan", { x: margin, y: 638, size: 34, font: bold, color: white });
page.drawText("Stability, coverage, revenue, valuation and marketing", { x: margin, y: 607, size: 14, font: regular, color: rgb(0.78, 0.82, 0.88) });
page.drawText("START DATE", { x: margin, y: 520, size: 9, font: bold, color: gold });
page.drawText("Sunday, August 2, 2026", { x: margin, y: 498, size: 15, font: regular, color: white });
page.drawText("RECOMMENDED FORMAL LAUNCH WINDOW", { x: margin, y: 446, size: 9, font: bold, color: gold });
page.drawText("August 31 - September 11, 2026", { x: margin, y: 424, size: 15, font: regular, color: white });
page.drawText("Best credible case: 3-4 weeks   |   Recommended: 4-6 weeks   |   Conservative: 6-8 weeks", { x: margin, y: 93, size: 9, font: regular, color: rgb(0.72, 0.77, 0.84) });

addPage();
heading("Executive recommendation", 1);
textBlock("Plan for four to six focused weeks to reach a defensible formal launch. Internally target a release candidate by August 21, then reserve at least one week for controlled collector testing and production burn-in.");
callout("The central scope decision", "A 90% cover target is achievable for collector-visible inventory: user collections, wantlists, featured titles, frequently searched series, current releases and high-value issues. Reaching 90% of the entire raw catalog is a multi-month data-acquisition program and should not block launch.");
heading("Current readiness", 2);
progress("Foundation and stabilization", 96);
progress("Cover ingestion and linking", 88);
progress("Valuation pipeline", 68);
progress("PDF and subscription convergence", 78);
progress("Overall revenue-engine readiness", 75);
heading("Launch definition", 2);
bullet("Zero known critical data-link defects and zero detected cross-major publisher mismatches.");
bullet("At least 90% cover coverage across the defined launch-priority universe.");
bullet("All core collector, billing and export workflows pass end-to-end testing.");
bullet("Pricing, entitlements and revenue positioning are locked.");
bullet("Every displayed valuation identifies its source, freshness and confidence.");
bullet("A 30-day marketing calendar is scheduled and measured.");

addPage();
heading("The three-track launch program", 1);
heading("Track A — Covers and data integrity", 2);
bullet("Complete the conservative global structural-link repair and manually review ambiguous exceptions.");
bullet("Use audited series publishers rather than raw scrambled publisher IDs.");
bullet("Require publisher-family, issue-number and issue-date evidence before assigning structural links.");
bullet("Prioritize user collections, wantlists, featured series, searches, key issues and current releases.");
bullet("Run nightly audits for cross-publisher links, dead storage objects and unresolved matches.");
heading("Track B — Valuation", 2);
bullet("Separate current asking prices from completed-sale evidence.");
bullet("Ingest every permitted eBay active listing that survives title, condition, lot and reproduction filters.");
bullet("Build a reviewed calibration fixture covering raw books, slabs, grades, eras and high/low liquidity.");
bullet("Preserve user-entered values and display source/sample/freshness metadata.");
heading("Track C — Revenue convergence", 2);
bullet("Finish the insurance/appraisal PDF design and large-collection stress pass.");
bullet("Lock Free and Collector Pro entitlements, monthly price and annual discount.");
bullet("Validate checkout, webhook, portal, cancellation, failed-payment and authorization paths.");
bullet("Treat marketplace transaction fees as a post-launch expansion rather than a launch dependency.");

addPage();
heading("Publisher and link integrity", 1);
textBlock("The raw GCD publisher relationships in the current database are not reliable enough to act as matching truth. The launch-safe matcher must use audited publisher values and structural evidence, then quarantine ambiguity instead of guessing.");
callout("Required invariant", "A cover may be structurally linked only when publisher family, series identity and issue evidence agree. If evidence is incomplete or tied, the cover remains explicitly unresolved and may use a conservative display fallback.");
heading("Automated controls", 2);
bullet("Audited `resolved_publisher_cached` is the primary publisher signal.");
bullet("Normalized publisher families handle known historical aliases and imprints.");
bullet("`series_gcd_id`, `gcd_issue_id` and `match_confidence` are stored together.");
bullet("Known corrupted source records receive explicit, documented overrides.");
bullet("A dashboard tracks resolved, series-only, unresolved and suspicious rows.");
bullet("Regression fixtures are added for every discovered failure pattern.");
heading("Launch error budget", 2);
bullet("No open P0 or P1 link defects.");
bullet("No detected cross-major publisher mismatches.");
bullet("Less than 0.1% suspicious links in a representative sampled audit.");
bullet("Every uncertain automated match is quarantined rather than silently assigned.");

addPage();
heading("eBay pricing strategy", 1);
textBlock("The eBay Browse API provides current purchasable listings and asking prices. Completed-sale history belongs to Marketplace Insights, which is Limited Release and requires an approved business use case. Production approval is not guaranteed.");
heading("Launch with two clearly labeled products", 2);
callout("Market listings", "Current eBay asking prices, auction/fixed-price labels, condition filtering and affiliate links. These are discovery data and must never be presented as completed sales or appraised value.");
callout("Estimated market value", "Completed-sale comparables when authorized, user-entered values, internal historical observations and conservative fallbacks. Always display source, sample size, freshness and confidence.");
heading("Revenue decision", 2);
bullet("Collector Pro subscription is the primary launch revenue stream.");
bullet("eBay affiliate referrals are the secondary stream.");
bullet("Defer the premium Vault tier until its PDF/private-sharing differentiation is proven.");
bullet("Defer marketplace transaction fees until after the subscription launch is stable.");
bullet("Avoid advertising during the initial trust-building phase.");
textBlock("Official references: developer.ebay.com/api-docs/buy/api-browse.html and developer.ebay.com/develop/get-started/get-started-on-a-buying-application", { size: 8.5, color: muted });

addPage();
heading("Execution calendar", 1);
heading("August 2 — Launch control room", 2);
bullet("Freeze unrelated features; establish one launch board, owners and pass/fail gates.");
bullet("Define the cover KPI universe; snapshot production; preserve the active ingest ledger.");
bullet("Quarantine unsafe publisher tools and checkpoint validated cover hardening.");
bullet("Lock a daily founder review time and P0/P1/P2 severity definitions.");
heading("August 3-5 — Data integrity", 2);
bullet("Dry-run, review and selectively apply the global cover-link repair.");
bullet("Audit cross-publisher, cross-year, duplicate and missing-storage failures.");
bullet("Refresh caches and verify known collision cases such as Marvel Tales and Witchblade.");
heading("August 4-15 — Priority cover completion", 2);
bullet("Run continuous prioritized ingestion with quota, failure and coverage reporting.");
bullet("Target 90% launch-priority coverage by the end of week two.");
heading("August 6-12 — Revenue lock", 2);
bullet("Finalize entitlements and pricing; complete PDF design and billing lifecycle QA.");
heading("August 8-17 — Valuation calibration", 2);
bullet("Integrate permitted listings, filter noise and validate a reviewed 100-comic fixture.");

addPage();
heading("Execution calendar, continued", 1);
heading("August 11-22 — Whole-site polish", 2);
bullet("Test signup, search, series, issues, library, variants, wantlist, imports, exports, profiles and subscriptions.");
bullet("Cover desktop/mobile, accessibility, empty/loading/error states, metadata, analytics and broken links.");
heading("August 15-29 — Marketing engine", 2);
bullet("Schedule 30 days of social posts, weekly articles, collector spotlights and launch email sequences.");
bullet("Prepare creator, comic-shop and community outreach plus support templates.");
bullet("Measure landing-to-signup, collection activation and upgrade conversion.");
heading("August 21-28 — Controlled soft launch", 2);
bullet("Invite real collectors to import collections, challenge covers and prices, generate PDFs and test subscriptions.");
bullet("Do not formally launch until all P0/P1 defects are closed and launch gates pass.");
heading("August 31-September 11 — Formal launch", 2);
bullet("Deploy during a staffed window and monitor errors, payments, ingestion and support continuously.");
bullet("Ship targeted fixes only; review acquisition, activation, conversion and retention daily.");
bullet("Resume broader feature work after seven stable production days.");

addPage();
heading("Formal launch gates", 1);
const gates = [
  ["Open P0 defects", "0"], ["Open P1 defects", "0"],
  ["Priority cover coverage", ">= 90%"], ["Known publisher mismatches", "0"],
  ["Core workflow success", ">= 99%"], ["API/server error rate", "< 1%"],
  ["Payment lifecycle tests", "100%"], ["Valuations with source labels", "100%"],
  ["Backup and recovery test", "Passed"], ["Marketing calendar", "30 days ready"],
];
for (const [label, value] of gates) {
  ensure(31);
  page.drawRectangle({ x: margin, y: y - 7, width: contentW, height: 27, color: pale });
  page.drawText(label, { x: margin + 10, y, size: 10, font: regular, color: ink });
  page.drawText(value, { x: pageW - margin - bold.widthOfTextAtSize(value, 10) - 10, y, size: 10, font: bold, color: navy });
  y -= 34;
}
heading("Schedule forecast", 2);
bullet("Best credible case: three to four weeks.");
bullet("Recommended plan: four to six weeks.");
bullet("Conservative plan: six to eight weeks.");
bullet("Ninety percent of the entire raw catalog: several months or longer.");
callout("Recommended commitment", "Target an internal release candidate on August 21, 2026 and a formal public launch between August 31 and September 11. Protect the final week for real-user testing and operational burn-in.");

const bytes = await pdf.save();
fs.writeFileSync(outPath, bytes);
console.log(outPath);
