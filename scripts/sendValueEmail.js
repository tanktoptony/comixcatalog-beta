import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadCopyValues, fetchAllPages, fetchByIds } from "./lib/collectionValues.js";
import { buildValueEmail } from "../src/lib/valueEmail.js";
import { resendBatch } from "../src/lib/newsletter.js";
import { issueNumberSuffix } from "../src/lib/issueNumberLabel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

function option(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

const apply = process.argv.includes("--apply");
const only = new Set((option("only") || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
const minimumValue = Number(option("min-value") ?? 0);
const outDir = option("out");
// Each member gets a campaign at most once: the sender claims a row in
// email_campaign_sends (migration 0111) before sending and releases it if the
// send fails, so a re-run or a second dispatch can't email anyone twice.
const campaign = option("campaign") || "value-2026-11";
if (!/^[a-z0-9-]{3,64}$/.test(campaign)) throw new Error("--campaign must be 3-64 lowercase letters, digits or dashes");
if (!Number.isFinite(minimumValue) || minimumValue < 0) throw new Error("--min-value must be a non-negative number");

for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "EMAIL_UNSUBSCRIBE_SECRET"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (apply && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required with --apply");

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const excluded = new Set(["test_tony", "test_tony_depaul", "thrice347", "tanktop__"]);

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function safeFilename(username, userId) {
  const cleaned = String(username || userId).replace(/[^a-z0-9._-]/gi, "_");
  return cleaned || String(userId);
}

function issueYear(issue) {
  const value = issue?.key_date || issue?.publication_date;
  const match = String(value || "").match(/^(\d{4})/);
  return match?.[1] || null;
}

function gradeLabel(copy) {
  const grade = Number(copy.grade_numeric);
  if (String(copy.slab_company || "").trim() && Number.isFinite(grade)) return `${String(copy.slab_company).trim()} ${grade.toFixed(1)}`;
  return String(copy.condition || "").trim() || "Raw";
}

async function alreadySent() {
  try {
    const rows = await fetchAllPages(() => supabase.from("email_campaign_sends").select("user_id").eq("campaign", campaign), "user_id");
    return new Set(rows.map((row) => String(row.user_id)));
  } catch (error) {
    // Before migration 0111 a preview still works; a real send never does.
    const missing = ["42P01", "PGRST205"].includes(error?.code);
    if (missing && !apply) {
      console.log("email_campaign_sends does not exist yet (migration 0111); previewing everyone.");
      return new Set();
    }
    throw error;
  }
}

// True only if this call inserted the row (nobody sent it first).
async function claim(userId) {
  const { data, error } = await supabase.from("email_campaign_sends")
    .upsert({ user_id: userId, campaign }, { onConflict: "user_id,campaign", ignoreDuplicates: true })
    .select("user_id");
  if (error) throw new Error(`Claim failed for ${userId}: ${error.message}`);
  return (data ?? []).length > 0;
}

async function release(userId) {
  const { error } = await supabase.from("email_campaign_sends").delete().eq("user_id", userId).eq("campaign", campaign);
  if (error) console.error(`Could not release the claim for ${userId}: ${error.message}`);
}

const profiles = await fetchAllPages(
  () => supabase.from("profiles").select("id, username, email_tips").eq("email_tips", true),
  "id"
);
const candidates = profiles.filter((profile) => {
  const username = String(profile.username || "").toLowerCase();
  if (only.size && !only.has(username)) return false;
  return only.has(username) || !excluded.has(username);
});
const copies = await loadCopyValues(supabase, { userIds: candidates.map((profile) => profile.id) });
const copiesByUser = new Map();
for (const copy of copies) {
  if (!copiesByUser.has(copy.user_id)) copiesByUser.set(copy.user_id, []);
  copiesByUser.get(copy.user_id).push(copy);
}

const sentIds = await alreadySent();
const recipients = candidates.map((profile) => {
  const userCopies = copiesByUser.get(profile.id) || [];
  return {
    profile,
    copies: userCopies,
    totalValue: roundCurrency(userCopies.reduce((sum, copy) => sum + copy.value, 0)),
    pricedCount: userCopies.filter((copy) => copy.value > 0).length,
  };
}).filter((recipient) => recipient.copies.length > 0 && recipient.totalValue >= minimumValue && !sentIds.has(String(recipient.profile.id)));

const topCandidates = recipients.flatMap(({ copies: userCopies }) => {
  const seen = new Set();
  return userCopies
    .filter((copy) => copy.value > 0 && copy.guide && (copy.source === "pricecharting" || copy.source === "pricecharting-regular"))
    .sort((a, b) => b.value - a.value)
    .filter((copy) => {
      const key = `${copy.gcd_issue_id}:${copy.grade_numeric ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
});
const issueIds = [...new Set(topCandidates.map((copy) => copy.gcd_issue_id).filter((id) => id != null))];
const issues = await fetchByIds(supabase, "gcd_issues", "gcd_id, issue_number, series_gcd_id, key_date, publication_date", "gcd_id", issueIds);
const issueById = new Map(issues.map((issue) => [Number(issue.gcd_id), issue]));
const seriesIds = [...new Set(issues.map((issue) => issue.series_gcd_id).filter((id) => id != null))];
const series = await fetchByIds(supabase, "series", "gcd_id, title", "gcd_id", seriesIds);
const seriesById = new Map(series.map((row) => [Number(row.gcd_id), row]));

if (!apply && outDir) await mkdir(outDir, { recursive: true });
const summaries = [];
for (const recipient of recipients) {
  const { profile, copies: userCopies, totalValue, pricedCount } = recipient;
  const seen = new Set();
  const topBooks = userCopies
    .filter((copy) => copy.value > 0 && copy.guide && (copy.source === "pricecharting" || copy.source === "pricecharting-regular"))
    .sort((a, b) => b.value - a.value)
    .filter((copy) => {
      const key = `${copy.gcd_issue_id}:${copy.grade_numeric ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map((copy) => {
      const issue = issueById.get(Number(copy.gcd_issue_id));
      const seriesRow = issue ? seriesById.get(Number(issue.series_gcd_id)) : null;
      const year = issueYear(issue);
      return {
        title: `${seriesRow?.title || "Unknown series"}${issueNumberSuffix(issue?.issue_number)}${year ? ` (${year})` : ""}`,
        gradeLabel: gradeLabel(copy),
        value: copy.value,
        guideUrl: copy.guide.url,
        issueUrl: `https://www.comixcatalog.com/issue/gcd-${copy.gcd_issue_id}`,
      };
    });

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id);
  if (authError) throw new Error(`Email lookup failed for ${profile.id}: ${authError.message}`);
  const emailAddress = authData?.user?.email;
  if (!emailAddress) continue;
  const message = buildValueEmail({ email: emailAddress, userId: profile.id, username: profile.username, totalValue, ownedCount: userCopies.length, pricedCount, topBooks });

  if (apply) {
    if (!(await claim(profile.id))) continue;
    try {
      await resendBatch([message]);
    } catch (error) {
      await release(profile.id);
      throw error;
    }
  } else if (outDir) {
    const filename = safeFilename(profile.username, profile.id);
    await writeFile(path.join(outDir, `${filename}.html`), message.html, "utf8");
    await writeFile(path.join(outDir, `${filename}.txt`), message.text, "utf8");
  }

  summaries.push({ username: profile.username || "(no username)", owned: userCopies.length, priced: pricedCount, total: totalValue, topBook: topBooks[0]?.title || "" });
  if (apply) console.log(`Sent value email to @${profile.username || "(no username)"} <sent>`);
}

console.table(summaries);
if (!apply && outDir) await writeFile(path.join(outDir, "index.json"), `${JSON.stringify(summaries, null, 2)}\n`, "utf8");
console.log(`${apply ? "Sent" : "Dry run prepared"} ${summaries.length} value email${summaries.length === 1 ? "" : "s"}.`);
