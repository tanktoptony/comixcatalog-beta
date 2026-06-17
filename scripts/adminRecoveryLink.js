// scripts/adminRecoveryLink.js
//
// Admin-side password recovery. When Supabase's email delivery is broken
// (rate-limited, SMTP misconfigured, going to spam), this generates a
// password-reset link directly via the service-role admin API and prints
// it to the console. Admin then pastes it to the user via Discord/DM/etc.
//
// Usage:
//   node scripts/adminRecoveryLink.js treystyles
//   node scripts/adminRecoveryLink.js user@example.com
//
// Matches a username OR an email. If a username, looks up the email via
// profiles + auth.users.

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/adminRecoveryLink.js <username-or-email>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://comixcatalog.com";

async function resolveEmail(input) {
  if (input.includes("@")) return input.toLowerCase();

  // Username path: profiles.username → profiles.id → auth.users.email
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", input.toLowerCase())
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) {
    throw new Error(`No profile with username '${input}'`);
  }

  const { data: authUser, error: aErr } = await supabase.auth.admin.getUserById(
    profile.id
  );
  if (aErr) throw aErr;
  if (!authUser?.user?.email) {
    throw new Error(`No email on auth user for '${input}' (id=${profile.id})`);
  }
  return authUser.user.email;
}

async function main() {
  const email = await resolveEmail(arg);
  console.log(`\nGenerating recovery link for: ${email}`);

  // type: "recovery" mints a single-use password-reset link. Admin can hand
  // the URL to the user out-of-band (DM, in-person, etc) so they bypass
  // the broken email path entirely.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${SITE_URL}/reset-password`,
    },
  });
  if (error) throw error;

  const link = data?.properties?.action_link;
  if (!link) {
    console.error("No action_link returned. Raw response:", data);
    process.exit(1);
  }

  console.log("\n──────────── SHARE THIS LINK ────────────");
  console.log(link);
  console.log("─────────────────────────────────────────");
  console.log(
    "\nThe link is single-use, expires per Supabase Auth settings.\n" +
      "When the user clicks it, they're redirected to /reset-password to\n" +
      "set a new password and sign in."
  );
}

main().catch((err) => {
  console.error("\nERROR:", err.message || err);
  process.exit(1);
});
