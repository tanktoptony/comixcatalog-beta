import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// instagramBot.js (imported for its Graph API helpers) builds a Supabase
// client at load time, so give it something to build with.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";

const { dueEntry, missingPhrases, foundersSlideHtml, QUEUE_PATH } = await import("./igSeriesPost.js");

test("only the entry dated today that hasn't posted is due", () => {
  const queue = { posts: [
    { slug: "a", post_on: "2026-11-03", posted: { media_id: "1" } },
    { slug: "b", post_on: "2026-11-03", posted: null },
    { slug: "c", post_on: "2026-11-10", posted: null },
  ] };
  assert.equal(dueEntry(queue, "2026-11-03").slug, "b");
  assert.equal(dueEntry(queue, "2026-11-04"), null, "a missed Tuesday never posts on another day");
  assert.equal(dueEntry({ posts: [] }, "2026-11-03"), null);
});

test("competitor check survives markup splitting a phrase", () => {
  const html = '<span>$</span> <b>49.00</b>\n<i>PER YEAR</i><h3>Missing Issues Smart List</h3><script>var x="Progress Tracking"</script>';
  assert.deepEqual(missingPhrases(html, ["49.00 per year", "Missing Issues Smart List"]), []);
  assert.deepEqual(missingPhrases(html, ["Progress Tracking"]), ["Progress Tracking"], "script text doesn't count");
});

test("founders slide fills every placeholder and shows no count", () => {
  const template = fs.readFileSync(new URL("./igSeries/founders-slide.html", import.meta.url), "utf8");
  const html = foundersSlideHtml(template, { slug: "missing", fontDir: "file:///fonts" });
  assert.ok(!html.includes("{{"), "no placeholder left behind");
  assert.ok(html.includes("/ig/missing") && html.includes("the first 100"));
  assert.ok(!/spots? left/i.test(html), "no spots-left number");
});

test("every queued post is approved, captioned and shows no founding count", () => {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8"));
  for (const post of queue.posts.filter((p) => !p.posted)) {
    assert.match(post.post_on, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(post.approved_by_tony, `${post.slug} needs Tony's approval date`);
    assert.ok(post.slides.length >= 1 && post.slides.every((url) => url.startsWith("https://")));
    assert.ok(!post.caption.includes("{{") && !/spots? left/i.test(post.caption), `${post.slug} caption shows a founding count`);
    assert.ok(!post.caption.includes("—"), `${post.slug} caption has an em dash`);
  }
});
