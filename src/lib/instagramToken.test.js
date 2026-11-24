// Instagram token check in the Monday email. Run: npm run test:instagram-token

import test from "node:test";
import assert from "node:assert/strict";

import { checkInstagramToken, instagramTokenHtml, instagramTokenStatus } from "./instagramToken.js";

const NOW = Date.parse("2026-11-23T13:00:00Z");
const DEC_1 = Date.parse("2026-12-01T13:12:05Z") / 1000;

test("a Page token that never expires is fine", () => {
  const status = instagramTokenStatus({ is_valid: true, type: "PAGE", expires_at: 0 }, NOW);
  assert.equal(status.level, "ok");
  assert.match(status.text, /doesn't expire/);
});

test("the current user token warns inside 10 days and not before", () => {
  assert.equal(instagramTokenStatus({ is_valid: true, type: "USER", expires_at: DEC_1 }, Date.parse("2026-11-16T13:00:00Z")).level, "ok");
  const warned = instagramTokenStatus({ is_valid: true, type: "USER", expires_at: DEC_1 }, NOW);
  assert.equal(warned.level, "warn");
  assert.match(warned.text, /expires in 9 days [(]2026-12-01[)]/);
});

test("a Monday check can't miss the 10-day window", () => {
  // Mondays are 7 days apart, so one always lands with 4 to 10 days left.
  for (let daysLeft = 11; daysLeft < 18; daysLeft += 1) {
    const expires = NOW / 1000 + daysLeft * 86400;
    const nextMonday = instagramTokenStatus({ is_valid: true, expires_at: expires }, NOW + 7 * 864e5);
    assert.equal(nextMonday.level, "warn", `${daysLeft} days left`);
  }
});

test("an expired or invalid token is an error", () => {
  assert.equal(instagramTokenStatus({ is_valid: true, expires_at: DEC_1 }, Date.parse("2026-12-02T00:00:00Z")).level, "error");
  assert.equal(instagramTokenStatus({ is_valid: false }, NOW).level, "error");
  assert.equal(instagramTokenStatus(null, NOW).level, "error");
});

const graph = (responses) => async (url) => {
  const key = Object.keys(responses).find((k) => String(url).includes(k));
  const { status = 200, body } = responses[key];
  return { ok: status < 400, status, json: async () => body };
};

test("a token that can read but can't post fails the check", async () => {
  const status = await checkInstagramToken({
    token: "SECRET",
    igUserId: "1",
    now: NOW,
    fetchImpl: graph({
      debug_token: { body: { data: { is_valid: true, type: "PAGE", expires_at: 0 } } },
      content_publishing_limit: { status: 403, body: { error: { message: "Missing permission SECRET" } } },
    }),
  });
  assert.equal(status.level, "error");
  assert.match(status.text, /could not be checked/);
  assert.ok(!status.text.includes("SECRET"), "the token never reaches the email");
});

test("a good token passes both calls", async () => {
  const status = await checkInstagramToken({
    token: "SECRET",
    igUserId: "1",
    now: NOW,
    fetchImpl: graph({
      debug_token: { body: { data: { is_valid: true, type: "PAGE", expires_at: 0 } } },
      content_publishing_limit: { body: { data: [{ quota_usage: 1 }] } },
    }),
  });
  assert.equal(status.level, "ok");
});

test("a missing secret says so instead of passing quietly", async () => {
  const status = await checkInstagramToken({ token: "", igUserId: "1", now: NOW });
  assert.equal(status.level, "error");
});

test("the email flags anything that needs action", () => {
  assert.ok(!instagramTokenHtml({ level: "ok", text: "fine" }).includes("Action needed"));
  assert.ok(instagramTokenHtml({ level: "warn", text: "soon" }).includes("Action needed"));
});
