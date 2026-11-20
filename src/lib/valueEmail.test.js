import test from "node:test";
import assert from "node:assert/strict";

process.env.EMAIL_UNSUBSCRIBE_SECRET = "value-email-test-secret";
const { buildValueEmail } = await import("./valueEmail.js");

const base = {
  email: "member@example.com",
  userId: "123e4567-e89b-42d3-a456-426614174000",
  totalValue: 72222.43,
  ownedCount: 2,
  pricedCount: 1,
  topBooks: [],
};

test("formats the subject and total with commas and cents", () => {
  const email = buildValueEmail(base);
  assert.equal(email.subject, "Your collection is worth $72,222.43");
  assert.match(email.text, /valued at \$72,222\.43 across 2 books/);
});

test("uses singular and all-priced wording", () => {
  const email = buildValueEmail({ ...base, ownedCount: 1, pricedCount: 1 });
  assert.match(email.text, /across 1 book\./);
  assert.match(email.text, /Your book has a value\./);
});

test("uses plural all-priced wording", () => {
  const email = buildValueEmail({ ...base, ownedCount: 1200, pricedCount: 1200 });
  assert.match(email.text, /All 1,200 of your books have a value\./);
});

test("escapes usernames in html", () => {
  const email = buildValueEmail({ ...base, username: "<script>alert(1)</script>" });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("links every top-book value to its guide and drops books without guides", () => {
  const guideUrl = "https://www.pricecharting.com/game/comic-books/amazing-1";
  const email = buildValueEmail({
    ...base,
    topBooks: [
      { title: "Amazing <One>", gradeLabel: "CGC 9.8", value: 1234.5, guideUrl, issueUrl: "https://www.comixcatalog.com/issue/gcd-1" },
      { title: "No Guide", gradeLabel: "Raw", value: 20, issueUrl: "https://www.comixcatalog.com/issue/gcd-2" },
    ],
  });
  assert.match(email.html, new RegExp(`<a href="${guideUrl.replaceAll("/", "\\/")}"[^>]*>\\$1,234\\.50<\\/a>`));
  assert.doesNotMatch(email.html, /No Guide/);
  assert.doesNotMatch(email.text, /No Guide/);
});

test("includes unsubscribe controls and no em dash", () => {
  const email = buildValueEmail(base);
  const unsubscribeUrl = email.headers["List-Unsubscribe"].slice(1, -1);
  assert.match(unsubscribeUrl, /^https:\/\/www\.comixcatalog\.com\/unsubscribe\/tips\?token=/);
  assert.ok(email.text.includes(unsubscribeUrl));
  assert.ok(email.html.includes(unsubscribeUrl));
  assert.doesNotMatch(`${email.subject}${email.text}${email.html}`, /\u2014/);
});
