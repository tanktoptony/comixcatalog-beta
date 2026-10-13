import test from "node:test";
import assert from "node:assert/strict";

import { buildInviteShare, isInviteEligible, normalizeInviteRef } from "./invites.js";

test("invite refs accept only normalized ComixCatalog usernames", () => {
  assert.equal(normalizeInviteRef("  Tony_C  "), "tony_c");
  assert.equal(normalizeInviteRef("ab"), null);
  assert.equal(normalizeInviteRef("not valid"), null);
});

test("invite acceptance is limited to an unclaimed profile's first 24 hours", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  assert.equal(isInviteEligible({ createdAt: "2026-10-12T12:00:01Z", now }), true);
  assert.equal(isInviteEligible({ createdAt: "2026-10-12T12:00:00Z", now }), false);
  assert.equal(isInviteEligible({ createdAt: "2026-10-13T11:00:00Z", invitedBy: "inviter", now }), false);
  assert.equal(isInviteEligible({ createdAt: "not-a-date", now }), false);
});

test("share payload uses the canonical invite URL and evergreen copy", () => {
  assert.deepEqual(buildInviteShare("Tony_C"), {
    title: "Join me on ComixCatalog",
    text: "I'm cataloging my comics on ComixCatalog. Come see my collection and start yours:",
    url: "https://www.comixcatalog.com/join/tony_c",
  });
});
