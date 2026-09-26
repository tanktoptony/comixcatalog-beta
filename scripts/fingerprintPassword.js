// Print the fingerprint for a password, so COMMON_FINGERPRINTS in
// src/lib/passwordPolicy.js can be extended without guesswork.
//
//   node scripts/fingerprintPassword.js "letmein2024"
//
// The list is stored as fingerprints because a literal list of the usual
// suspects is indistinguishable from hardcoded credentials to a secret
// scanner — GitGuardian failed the PR that introduced it on exactly that.
// Without this script the list would be write-only, which is how a denylist
// quietly stops being maintained.
//
// Nothing here is a secret: the fingerprint is not reversible in any useful
// sense, and the inputs are the most-guessed strings in the world.

import { fingerprintForList } from "../src/lib/passwordPolicy.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node scripts/fingerprintPassword.js "<password>" ["<another>" ...]');
  process.exit(2);
}

for (const value of args) {
  console.log(`${fingerprintForList(value)}  ${"*".repeat(Math.min(value.length, 16))}`);
}
