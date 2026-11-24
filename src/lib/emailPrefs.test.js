import test from "node:test";
import assert from "node:assert/strict";
import { buildActivityEmail, buildDigestEmail, digestCampaign, digestHasNews, followLine, instantDue, prefsFromRow } from "./emailPrefs.js";

process.env.EMAIL_UNSUBSCRIBE_SECRET = "email-prefs-test-secret";
const { signUnsubscribeToken, unsubscribeLink, verifyUnsubscribeToken } = await import("./emailUnsubscribe.js");
const USER = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";

test("a missing row or unknown value means the defaults", () => {
  assert.deepEqual(prefsFromRow(null), { email_on_message: true, email_activity: "daily", email_weekly_digest: true });
  assert.deepEqual(prefsFromRow({ email_on_message: false, email_activity: "loud", email_weekly_digest: false }), { email_on_message: false, email_activity: "daily", email_weekly_digest: false });
  assert.equal(prefsFromRow({ email_activity: "off" }).email_activity, "off");
});

test("right-away emails wait at least ten minutes between sends", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  assert.equal(instantDue(null, now), true);
  assert.equal(instantDue("2026-11-22T11:55:00Z", now), false);
  assert.equal(instantDue("2026-11-22T11:50:00Z", now), true);
});

test("activity emails escape what members typed and link back", () => {
  const email = buildActivityEmail({
    mode: "daily",
    unsubscribeUrl: "https://www.comixcatalog.com/unsubscribe/activity?token=x",
    items: [{ kind: "reply", actor: "treystyles", label: "Saga #1", excerpt: "<script>alert(1)</script> nice", url: "/issue/gcd-1#comment-9" }],
  });
  assert.equal(email.subject, "@treystyles replied to your comment on Saga #1");
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /https:\/\/www\.comixcatalog\.com\/issue\/gcd-1#comment-9/);
  assert.match(email.text, /unsubscribe\/activity\?token=x/);
});

test("long activity lists show ten and count the rest", () => {
  const items = Array.from({ length: 13 }, (_, i) => ({ kind: "mention", actor: `m${i}`, label: "a list", url: "/lists" }));
  const email = buildActivityEmail({ items, mode: "daily" });
  assert.equal(email.subject, "13 new replies and mentions on ComixCatalog");
  assert.match(email.html, /And 3 more\./);
});

test("the subject says what is inside", () => {
  const done = (label) => ({ kind: "request_done", label, url: "/issue/gcd-1" });
  const subject = (items) => buildActivityEmail({ items, mode: "daily" }).subject;
  assert.equal(subject([done("Saga #1"), done("Saga #2")]), "2 books you asked for are in the catalog");
  assert.equal(subject([done("Saga #1"), { kind: "reply", actor: "a", label: "X #1", url: "/x" }]), "2 new things for you on ComixCatalog");
  assert.equal(subject([done("Saga #1")]), "Saga #1 is in the catalog now");
});

test("the digest only goes out when there's something besides the value", () => {
  assert.equal(digestHasNews({ value: { total: 500, change: 20 }, following: [{ username: "a", added: 0, wanted: 0, listed: 0, reviewed: 0 }], wantlistListed: [], tradeMatches: 0, unread: 0 }), false);
  assert.equal(digestHasNews({ following: [], wantlistListed: [], tradeMatches: 4, unread: 0 }), false);
  assert.equal(digestHasNews({ following: [{ username: "a", added: 2 }], wantlistListed: [], tradeMatches: 0, unread: 0 }), true);
  assert.equal(digestHasNews({ following: [], wantlistListed: [{ title: "X #1", url: "/listing/1" }], tradeMatches: 0, unread: 0 }), true);
});

test("follow lines read naturally", () => {
  assert.equal(followLine({ username: "tsouth", added: 12, wanted: 3, listed: 0, reviewed: 1 }), "@tsouth added 12 books, wanted 3 and reviewed 1");
  assert.equal(followLine({ username: "x", added: 1 }), "@x added 1 book");
  assert.equal(followLine({ username: "x", added: 0 }), null);
  assert.equal(followLine({ username: "xabbott", added: 5620 }), "@xabbott added 5,620 books");
});

test("the digest leads with wantlist books for sale and credits PriceCharting", () => {
  const email = buildDigestEmail({
    unsubscribeUrl: "https://www.comixcatalog.com/unsubscribe/digest?token=y",
    digest: { value: { total: 1667.5, change: 40 }, following: [{ username: "tsouth", added: 3 }], wantlistListed: [{ title: "Saga #1", price: 25, url: "/listing/7" }], tradeMatches: 2, unread: 1 },
  });
  assert.equal(email.subject, "A book from your wantlist is for sale");
  assert.match(email.html, /\$1,667\.50/);
  assert.match(email.html, /up \$40\.00 this week/);
  assert.match(email.html, /PriceCharting/);
  assert.match(email.text, /trade matches with 2 collectors/);
  assert.match(email.text, /unsubscribe\/digest\?token=y/);
});

test("one digest campaign per ISO week", () => {
  assert.equal(digestCampaign(new Date("2026-11-22T15:00:00Z")), "digest-2026-w47");
  assert.equal(digestCampaign(new Date("2026-11-23T15:00:00Z")), "digest-2026-w48");
  assert.equal(digestCampaign(new Date("2027-01-01T15:00:00Z")), "digest-2026-w53");
  assert.match(digestCampaign(), /^[a-z0-9-]{3,64}$/);
});

test("an unsubscribe link only works for its own email type", () => {
  const token = signUnsubscribeToken("digest", USER);
  assert.equal(verifyUnsubscribeToken("digest", token), USER);
  assert.equal(verifyUnsubscribeToken("activity", token), null);
  assert.equal(verifyUnsubscribeToken("tips", token), null);
  assert.equal(verifyUnsubscribeToken("digest", `${token}x`), null);
  assert.equal(verifyUnsubscribeToken("digest", "not-a-token"), null);
  assert.match(unsubscribeLink("activity", USER), /^https:\/\/www\.comixcatalog\.com\/unsubscribe\/activity\?token=/);
});
