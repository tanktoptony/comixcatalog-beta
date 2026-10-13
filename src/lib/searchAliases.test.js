import test from "node:test";
import assert from "node:assert/strict";
import { aliasTermsFor } from "./searchAliases.js";

const TERMS = ["amorywars", "bagonlineadventures", "goodapolloimburningstariv"];
const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

test("known aliases expand to their title terms", () => {
  assert.deepEqual(aliasTermsFor("coheed"), TERMS);
  assert.deepEqual(aliasTermsFor(normalize("Coheed and Cambria")), TERMS);
});

test("type-ahead prefixes expand only after five characters", () => {
  assert.deepEqual(aliasTermsFor("cohee"), TERMS);
  assert.deepEqual(aliasTermsFor("coh"), []);
});

test("unrelated and empty searches do not expand", () => {
  assert.deepEqual(aliasTermsFor("batman"), []);
  assert.deepEqual(aliasTermsFor(""), []);
});
