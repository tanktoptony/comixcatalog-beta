import test from "node:test";
import assert from "node:assert/strict";
import {
  canViewList,
  reorder,
  slugify,
  uniqueSlug,
  validateListInput,
  validateNote,
} from "./lists.js";

test("slugify folds, trims, collapses, limits, and supplies a fallback", () => {
  assert.equal(
    slugify("  H\u00e9llboy: Seed / Destruction! "),
    "hellboy-seed-destruction"
  );
  assert.equal(slugify("***"), "list");
  const value = slugify(`${"word-".repeat(20)}tail`);
  assert.ok(value.length <= 80);
  assert.ok(!value.endsWith("-"));
});

test("uniqueSlug resolves collisions", () => {
  assert.equal(uniqueSlug("keys", ["keys", "keys-2"]), "keys-3");
});

test("validateListInput normalizes a full input", () => {
  assert.deepEqual(
    validateListInput({
      title: " Picks ",
      description: "  ",
      is_public: true,
      is_ranked: false,
    }),
    {
      value: {
        title: "Picks",
        description: null,
        is_public: true,
        is_ranked: false,
      },
    }
  );
});

test("validateListInput supports partial and rejects invalid values", () => {
  assert.deepEqual(
    validateListInput({ description: " note " }, { partial: true }),
    { value: { description: "note" } }
  );
  assert.ok(validateListInput({ title: "" }).error);
  assert.ok(validateListInput({ is_public: "yes" }, { partial: true }).error);
});

test("validateNote trims, nulls empty, and enforces its limit", () => {
  assert.deepEqual(validateNote(" hi "), { value: "hi" });
  assert.deepEqual(validateNote(" "), { value: null });
  assert.ok(validateNote("x".repeat(501)).error);
});

test("reorder moves an item and compacts positions", () => {
  const result = reorder(
    [
      { base_gcd_issue_id: 1, position: 4 },
      { base_gcd_issue_id: 2, position: 8 },
    ],
    2,
    0
  ).map((item) => [item.base_gcd_issue_id, item.position]);

  assert.deepEqual(result, [
    [2, 0],
    [1, 1],
  ]);
});

test("canViewList allows owner and public member lists, but not private profiles", () => {
  const list = { user_id: "a", is_public: true };
  assert.equal(
    canViewList(
      { ...list, is_public: false },
      { username: "me", is_public: false },
      "a"
    ),
    true
  );
  assert.equal(
    canViewList(list, { username: "me", is_public: true }, null),
    true
  );
  assert.equal(
    canViewList(list, { username: "me", is_public: false }, null),
    false
  );
});
