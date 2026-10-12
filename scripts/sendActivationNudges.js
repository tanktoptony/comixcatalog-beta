import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ACTIVATION_NUDGE_SEND_CAP, buildActivationNudgeEmail, chooseActivationNudge } from "../src/lib/activationNudges.js";
import { resendBatch } from "../src/lib/newsletter.js";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
if (!dryRun && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required");
if (!process.env.EMAIL_UNSUBSCRIBE_SECRET) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is required");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: settings, error: settingsError } = await supabase.from("activation_nudge_settings").select("shipped_at").eq("singleton", true).single();
if (settingsError) throw new Error(`Cutoff lookup failed: ${settingsError.message}`);

// Bound candidate work separately from the 50-send safety cap. Oldest first
// keeps a growing signup burst from starving members closest to their window.
const { data: profiles, error: profilesError } = await supabase.from("profiles")
  .select("id, username, created_at, email_tips, nudge1_sent_at, nudge2_sent_at")
  .eq("email_tips", true)
  .gte("created_at", settings.shipped_at)
  .lte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString())
  .order("created_at", { ascending: true })
  .limit(250);
if (profilesError) throw new Error(`Candidate lookup failed: ${profilesError.message}`);

let sent = 0;
for (const profile of profiles || []) {
  if (sent >= ACTIVATION_NUDGE_SEND_CAP) break;
  const nudge = chooseActivationNudge(profile, settings.shipped_at);
  if (!nudge) continue;

  // A readable preflight powers dry-run output. The claim RPC repeats this
  // zero-book check atomically with the sent-at stamp for live deliveries.
  const { count, error: countError } = await supabase.from("user_collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .in("status", ["owned", "for_sale"]);
  if (countError) throw new Error(`Collection check failed for ${profile.id}: ${countError.message}`);
  if (count) continue;

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id);
  if (authError) throw new Error(`Email lookup failed for ${profile.id}: ${authError.message}`);
  const email = authData?.user?.email;
  if (!email) continue;

  if (dryRun) {
    console.log(`[dry-run] nudge${nudge} @${profile.username || "(no username)"} <${email}>`);
    sent += 1;
    continue;
  }

  const { data: claimed, error: claimError } = await supabase.rpc("claim_activation_nudge", { p_user_id: profile.id, p_nudge: nudge });
  if (claimError) throw new Error(`Claim failed for ${profile.id}: ${claimError.message}`);
  if (!claimed) continue;
  await resendBatch([buildActivationNudgeEmail(nudge, email, profile.id)]);
  console.log(`Sent nudge${nudge} to @${profile.username || "(no username)"}`);
  sent += 1;
}

console.log(`${dryRun ? "Dry run found" : "Sent"} ${sent} activation nudge${sent === 1 ? "" : "s"}.`);
