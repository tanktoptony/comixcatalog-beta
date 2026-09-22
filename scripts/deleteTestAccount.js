// Delete a leftover TEST account, in the same FK-safe order as
// /api/account/delete (comic_covers -> comics -> user_collections -> profiles
// -> auth.users). Refuses anything that does not look like a test account
// unless --force is passed, so a typo cannot take out a real collector.
//
//   node scripts/deleteTestAccount.js <profile uuid>            # dry run
//   node scripts/deleteTestAccount.js <profile uuid> --apply    # delete
//
// Added 2026-09-21 after the OAuth verification pass (2026-09-13) left
// oauthfixver178927334 (oau***@example.com) behind despite saying it had
// cleaned up. Test accounts must be deleted by the pass that creates them;
// this exists for when they are not.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const TEST_EMAIL_DOMAINS = ["example.com", "example.org", "test.local"];

const id = process.argv[2];
const APPLY = process.argv.includes("--apply");
const FORCE = process.argv.includes("--force");
if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
  console.error("usage: node scripts/deleteTestAccount.js <profile uuid> [--apply] [--force]");
  process.exit(2);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: profile } = await supabase.from("profiles").select("id, username, created_at, is_founding_collector").eq("id", id).maybeSingle();
const { data: authData } = await supabase.auth.admin.getUserById(id);
const user = authData?.user ?? null;
const email = user?.email ?? "";
const domain = email.split("@")[1] ?? "";

console.log(`profile:   ${profile ? `${profile.username} (created ${profile.created_at}, founding=${profile.is_founding_collector})` : "none"}`);
const masked = email.replace(/^(.{3}).*(@.*)$/, "$1***$2");
console.log(`auth user: ${user ? `${masked}, created ${user.created_at}, last sign-in ${user.last_sign_in_at ?? "never"}` : "none"}`);

if (!profile && !user) { console.log("Nothing to delete."); process.exit(0); }

const looksLikeTest = TEST_EMAIL_DOMAINS.includes(domain);
if (!looksLikeTest && !FORCE) {
  console.error(`\nRefusing: ${email || "(no email)"} is not on a test domain (${TEST_EMAIL_DOMAINS.join(", ")}). Pass --force if you are sure.`);
  process.exit(1);
}
if (profile?.is_founding_collector && !FORCE) {
  console.error("\nRefusing: this account holds a Founding Collector flag. Pass --force if you are sure.");
  process.exit(1);
}

// Same shape as /api/account/delete: comics are keyed by created_by,
// comic_covers by uploaded_by and by comic_id of the user's own comics.
const { data: ownComics } = await supabase.from("comics").select("id").eq("created_by", id);
const ownComicIds = (ownComics ?? []).map((c) => c.id);
const steps = [
  ["comic_covers", (q) => q.eq("uploaded_by", id)],
  ...(ownComicIds.length ? [["comic_covers (on own comics)", (q) => q.in("comic_id", ownComicIds), "comic_covers"]] : []),
  ["comics", (q) => q.eq("created_by", id)],
  ["user_collections", (q) => q.eq("user_id", id)],
  ["profiles", (q) => q.eq("id", id)],
];
for (const [label, where, table = label] of steps) {
  const { count, error: countErr } = await where(supabase.from(table).select("*", { count: "exact", head: true }));
  if (countErr) { console.error(`  ${label}: ${countErr.message}`); process.exit(1); }
  console.log(`${APPLY ? "deleting" : "would delete"} ${count ?? 0} row(s) from ${label}`);
  if (APPLY) {
    const { error } = await where(supabase.from(table).delete());
    if (error) { console.error(`  ${label}: ${error.message}`); process.exit(1); }
  }
}
if (user) {
  console.log(`${APPLY ? "deleting" : "would delete"} auth user`);
  if (APPLY) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) { console.error(`  auth: ${error.message}`); process.exit(1); }
  }
}
console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply to delete.");
