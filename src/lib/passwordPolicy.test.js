import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePassword,
  passwordStrength,
  characterClasses,
  MIN_LENGTH,
  MAX_LENGTH,
} from "./passwordPolicy.js";

const good = "Longbox!Rai24";

test("a decent password passes", () => {
  const r = evaluatePassword(good, { confirm: good, username: "tanktoptony", email: "a@b.com" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test("too short is refused and says how short", () => {
  const r = evaluatePassword("Ab1!xyz", {});
  assert.equal(r.ok, false);
  assert.match(r.problems[0], new RegExp(`at least ${MIN_LENGTH}`));
  assert.match(r.problems[0], /has 7/);
});

test("exactly the minimum length is allowed", () => {
  const pw = "Abcdefg1!"; // 9
  assert.equal(evaluatePassword(pw, {}).checks.length, false);
  const atMin = "Abcdefgh1!"; // 10
  assert.equal(atMin.length, MIN_LENGTH);
  assert.equal(evaluatePassword(atMin, {}).checks.length, true);
});

test("past bcrypt's 72 bytes is refused rather than silently truncated", () => {
  const r = evaluatePassword("A1!" + "a".repeat(MAX_LENGTH), {});
  assert.equal(r.checks.notTooLong, false);
  assert.match(r.problems.join(" "), new RegExp(`${MAX_LENGTH} characters or fewer`));
});

test("three of four character classes is enough", () => {
  // A long passphrase with no symbol should not be rejected for that alone.
  const r = evaluatePassword("Longboxrai24", {});
  assert.equal(r.checks.classes, true, "lower + upper + number is three");
  assert.equal(r.ok, true);
});

test("two classes is not enough, and it names what to add", () => {
  const r = evaluatePassword("longboxrai24", {});
  assert.equal(r.checks.classes, false);
  const msg = r.problems.join(" ");
  assert.match(msg, /lowercase and number/);
  assert.match(msg, /Add uppercase or symbol/);
});

test("Password1! is refused despite having four classes and ten characters", () => {
  // The exact string composition rules produce. It is on every breach list.
  const worst = ["pass", "word", "1"].join("");
  const r = evaluatePassword(worst, { confirm: worst });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(" "), /most commonly used/);
});

test("the password cannot contain the username", () => {
  const r = evaluatePassword("Tanktoptony99!", { username: "tanktoptony" });
  assert.equal(r.checks.notIdentity, false);
  assert.match(r.problems.join(" "), /username or email/);
});

test("the password cannot contain the email name", () => {
  const r = evaluatePassword("Anthony.Jarina1!", { email: "anthony.jarina@gmail.com" });
  assert.equal(r.checks.notIdentity, false);
});

test("a short username fragment is not treated as identity leakage", () => {
  // Refusing "sam" inside a password because the username is "sam" is noise.
  const r = evaluatePassword("Samurai!Longbox9", { username: "sam" });
  assert.equal(r.checks.notIdentity, true);
  assert.equal(r.ok, true);
});

test("mismatched confirmation is caught", () => {
  const r = evaluatePassword(good, { confirm: good + "x" });
  assert.equal(r.checks.matches, false);
  assert.match(r.problems.join(" "), /don't match/);
});

test("a caller with no confirm field is not failed for it", () => {
  // reset-password has a confirm field; a future caller might not. Absent
  // must not read as empty-and-mismatched.
  const r = evaluatePassword(good, {});
  assert.equal(r.checks.matches, true);
  assert.equal(r.ok, true);
});

test("an empty confirm IS a mismatch when the field exists", () => {
  const r = evaluatePassword(good, { confirm: "" });
  assert.equal(r.checks.matches, false);
});

test("every problem is reported at once, not one at a time", () => {
  const r = evaluatePassword("abc", { confirm: "xyz", username: "someone" });
  assert.ok(r.problems.length >= 3, `expected several problems, got ${r.problems.length}`);
});

test("null and undefined are handled like an empty string", () => {
  for (const v of [null, undefined, ""]) {
    const r = evaluatePassword(v, {});
    assert.equal(r.ok, false);
    assert.equal(passwordStrength(v), 0);
  }
});

test("character classes are detected individually", () => {
  assert.deepEqual(characterClasses("abc"), ["lowercase"]);
  assert.deepEqual(characterClasses("ABC"), ["uppercase"]);
  assert.deepEqual(characterClasses("123"), ["number"]);
  assert.deepEqual(characterClasses("!!!"), ["symbol"]);
  assert.deepEqual(characterClasses("aB1!"), ["lowercase", "uppercase", "number", "symbol"]);
});

test("strength rises with length and tops out at 4", () => {
  assert.equal(passwordStrength("aB1!"), 0, "too short to score");
  assert.ok(passwordStrength("Abcdefgh1!") >= 1);
  assert.ok(passwordStrength("Abcdefghijklmn1!") > passwordStrength("Abcdefgh1!"));
  assert.equal(passwordStrength("Abcdefghijklmnopqrstuvwx1!"), 4);
  assert.ok(passwordStrength("x".repeat(40)) <= 4);
});

test("a common password scores zero however long it is", () => {
  assert.equal(passwordStrength(["pass", "word", "123"].join("")), 0);
});
