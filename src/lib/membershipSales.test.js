import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDING_MEMBERSHIP_COPY,
  membershipMenuLink,
} from "./membershipSales.js";

test("closed sales hide the upgrade link from a free member", () => {
  assert.equal(membershipMenuLink({ salesOpen: false }), null);
});

test("closed sales keep membership management for a paid member", () => {
  assert.deepEqual(
    membershipMenuLink({ membershipTier: "collector_plus", salesOpen: false }),
    { href: "/account", label: "Manage membership" },
  );
});

test("founding membership copy has no paid price or old tier name", () => {
  const copy = JSON.stringify(FOUNDING_MEMBERSHIP_COPY);
  assert.doesNotMatch(copy, /Collector\+/i);
  assert.doesNotMatch(copy, /[$£€]|\b(?:price|costs?|per month|per year)\b/i);
});
