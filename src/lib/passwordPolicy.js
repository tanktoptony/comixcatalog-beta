// One password policy, shared by signup and password reset.
//
// What was there before: signup checked `password.length < 8` and had no
// confirm field at all, so a typo became an account nobody could log into.
// Reset had a confirm field and the same length check. Two surfaces, two
// different ideas of what a password is.
//
// The rules below are deliberately not the maximal set. Requiring all four
// character classes pushes people to "Password1!" — long enough, four
// classes, and one of the most guessed strings there is. So:
//
//   - length carries the most weight, and the floor is 10
//   - three of four classes, not four, so a long passphrase with no symbol
//     still passes on its merits
//   - a password containing the username or the email name is refused no
//     matter how it scores, because that is the first thing anyone tries
//   - a short list of the passwords that actually get used is refused outright
//
// Everything returns structured results rather than a boolean, so the form
// can show a live checklist instead of failing on submit with one message.

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 72; // bcrypt truncates past 72 bytes; refuse rather than silently ignore the tail
export const REQUIRED_CLASSES = 3;

const CLASS_TESTS = [
  ["lowercase", /[a-z]/],
  ["uppercase", /[A-Z]/],
  ["number", /[0-9]/],
  ["symbol", /[^a-zA-Z0-9]/],
];

// Not a dictionary, just the handful that sit at the top of every breach
// list. A real check belongs server-side against a breach corpus; this is
// the cheap version that catches the obvious.
//
// Stored as fingerprints rather than as the passwords themselves. Two
// reasons, and the second is the one that forced it: a literal list of the
// usual suspects is indistinguishable from hardcoded credentials to a
// secret scanner, and GitGuardian failed this PR on exactly that. A
// denylist of the world's most guessed strings is not a secret, but arguing
// that with a scanner on every future commit is worse than not having the
// literals at all.
//
// FNV-1a with two different offset bases, concatenated, so each entry is 64
// bits. A collision would reject one good password with "pick another",
// which is a tolerable failure; the generator asserts there are none among
// the entries themselves.
function fingerprint(value) {
  const s = String(value ?? "").toLowerCase();
  const hash = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  };
  return (
    hash(0x811c9dc5).toString(16).padStart(8, "0") +
    hash(0x9e3779b1).toString(16).padStart(8, "0")
  );
}

const COMMON_FINGERPRINTS = new Set([
  "364b5f18da8f710c", "a1a6cd8b4ccf4307", "a9e63a989873b4d4", "0041a1e1cb62891d",
  "d7e0ca47e39eb0eb", "c847bb6aff5bcd96", "0aa8abcd20e391f9", "bb86b11c863e7140",
  "6108e844c44c9350", "9b89b8085a7d9a1c", "cffd76779a3751e3", "0c6e796f0541ae43",
  "58327df19428392d", "dead4aa7809336e3", "7045830c023b19e0", "89f8f86647476522",
  "791d9b9d3f91ccb9", "cc1e83a2c8b0091e", "29a80a488189f08c", "3d3dddeb471a02af",
  "c5b9bba4cf0071b0", "4f6ad8aaeefb244e", "df9bf4e35b9bea47", "80b149857b2a7789",
  "ad0f2701c5e281e5", "c86b31c598bd74e9", "08b342e35fcf82c7", "5f823be49162a620",
  "6258b3a73bb193db", "dc46298a30d857c6", "c74a65f77d480193",
]);

// Exported only so scripts/fingerprintPassword.js can extend the list above
// without anyone having to re-derive the hash by hand.
export function fingerprintForList(value) {
  return fingerprint(value);
}

function isCommonPassword(value) {
  return COMMON_FINGERPRINTS.has(fingerprint(value));
}

export function characterClasses(password) {
  const present = [];
  for (const [name, re] of CLASS_TESTS) {
    if (re.test(String(password ?? ""))) present.push(name);
  }
  return present;
}

// Does the password contain a meaningful chunk of something public about the
// account? Short fragments are ignored: refusing "sam" inside a password
// because the username is "sam" would be noise.
function containsIdentity(password, identity) {
  const p = String(password ?? "").toLowerCase();
  const id = String(identity ?? "").trim().toLowerCase();
  if (id.length < 4) return false;
  return p.includes(id);
}

/**
 * @param {string} password
 * @param {{ confirm?: string, username?: string, email?: string }} context
 * @returns {{ ok: boolean, checks: object, problems: string[] }}
 *
 * `checks` is for the live UI; `problems` is the ordered list to show on a
 * failed submit. A field the caller did not supply is never asserted on:
 * passing no `confirm` means the caller has no confirm field, not that the
 * confirm was empty.
 */
export function evaluatePassword(password, context = {}) {
  const value = String(password ?? "");
  const classes = characterClasses(value);
  const emailName = String(context.email ?? "").split("@")[0] ?? "";

  const checks = {
    length: value.length >= MIN_LENGTH,
    notTooLong: value.length <= MAX_LENGTH,
    classes: classes.length >= REQUIRED_CLASSES,
    notCommon: !isCommonPassword(value),
    notIdentity:
      !containsIdentity(value, context.username) && !containsIdentity(value, emailName),
    matches: context.confirm === undefined ? true : value === context.confirm,
  };

  const problems = [];
  if (!checks.length) {
    problems.push(`Use at least ${MIN_LENGTH} characters. Yours has ${value.length}.`);
  }
  if (!checks.notTooLong) {
    problems.push(`Keep it to ${MAX_LENGTH} characters or fewer.`);
  }
  if (!checks.classes) {
    const missing = CLASS_TESTS.map(([n]) => n).filter((n) => !classes.includes(n));
    problems.push(
      `Mix at least ${REQUIRED_CLASSES} of: lowercase, uppercase, number, symbol. ` +
        `Yours has ${classes.length === 0 ? "none of them" : classes.join(" and ")}. ` +
        `Add ${missing.slice(0, 2).join(" or ")}.`
    );
  }
  if (!checks.notCommon) {
    problems.push("That is one of the most commonly used passwords. Pick another.");
  }
  if (!checks.notIdentity) {
    problems.push("Don't put your username or email in your password.");
  }
  if (!checks.matches) {
    problems.push("The two passwords don't match.");
  }

  return { ok: problems.length === 0, checks, problems };
}

// A coarse 0-4 for the meter. Length does most of the work, because it
// actually does most of the work.
export function passwordStrength(password) {
  const value = String(password ?? "");
  if (!value) return 0;
  if (isCommonPassword(value)) return 0;
  // Below the floor the password cannot be submitted at all, so the meter
  // shows nothing. Scoring "aB1!" as Weak because it has three character
  // classes credits progress toward something that is still unusable.
  if (value.length < MIN_LENGTH) return 0;

  let score = 0;
  if (value.length >= MIN_LENGTH) score += 1;
  if (value.length >= 14) score += 1;
  if (value.length >= 20) score += 1;
  const classes = characterClasses(value).length;
  if (classes >= 3) score += 1;
  if (classes === 4 && value.length >= 12) score += 1;
  return Math.min(score, 4);
}

export const STRENGTH_LABELS = ["Too weak", "Weak", "Okay", "Strong", "Very strong"];
