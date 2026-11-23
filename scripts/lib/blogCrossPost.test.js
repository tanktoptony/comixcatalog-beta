import { test } from "node:test";
import assert from "node:assert/strict";
import {
  facebookMessage,
  instagramCaption,
  isInWindow,
  isMissingPermission,
  ledgerKey,
  patreonEmail,
  pendingChannels,
} from "./blogCrossPost.js";

const SITE = "https://www.comixcatalog.com";
const post = { slug: "worth-and-who-has-it", title: "What your books are worth", excerpt: "Values from a real guide.", published_at: "2026-11-24T15:00:00Z" };
const now = new Date("2026-11-24T16:00:00Z");

test("a new post needs every channel", () => {
  assert.deepEqual(pendingChannels(post, new Set(), now), ["instagram", "facebook", "patreon"]);
});

test("Instagram shares the bot's key, so the weekly slot never repeats the post", () => {
  assert.equal(ledgerKey("instagram", "x"), "brand:blog:x");
  const posted = new Set(["brand:blog:worth-and-who-has-it", "patreon:blog:worth-and-who-has-it"]);
  assert.deepEqual(pendingChannels(post, posted, now), ["facebook"]);
});

test("posts from before the feature, or older than the window, are left alone", () => {
  assert.equal(isInWindow("2026-11-10T00:00:00Z", now), false);
  assert.deepEqual(pendingChannels({ ...post, published_at: "2026-11-24T15:00:00Z" }, new Set(), new Date("2026-12-05T00:00:00Z")), []);
  assert.equal(isInWindow("not a date", now), false);
});

test("Instagram points at the bio; Facebook carries the link", () => {
  assert.match(instagramCaption(post), /Link in bio/);
  assert.doesNotMatch(instagramCaption(post), /https?:\/\//);
  assert.match(facebookMessage(post, SITE), /https:\/\/www\.comixcatalog\.com\/blog\/worth-and-who-has-it/);
});

test("the Patreon email escapes text and lists what else went out", () => {
  const email = patreonEmail({ post: { ...post, title: "Batman & <Robin>" }, siteUrl: SITE, imageUrl: "https://x/card.png", results: { Instagram: "posted" } });
  assert.match(email.subject, /Patreon post ready/);
  assert.match(email.html, /Batman &amp; &lt;Robin&gt;/);
  assert.match(email.html, /Instagram:<\/b> posted/);
});

test("a missing Facebook permission is told apart from an outage", () => {
  assert.equal(isMissingPermission({ code: 200, message: "(#200) requires pages_manage_posts permission" }), true);
  assert.equal(isMissingPermission({ code: 2, message: "Service temporarily unavailable" }), false);
});
