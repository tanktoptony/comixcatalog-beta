// imageLedgerKey is the whole basis of "never post the same cover twice",
// and it is only correct if two different callers agree on the key.
//
// The pickers pass a bare storage_path (deciding whether to skip a
// candidate). run() passes a full public URL (recording what went out). If
// those produce different strings the guard never fires and nothing
// complains — the bot just quietly repeats covers, which is the bug this
// was written to stop.
//
// The first version got exactly that wrong: it stripped the leading path
// segment unconditionally, so a URL became "comicvine/rai/..." while the
// bare path became "rai/vol-4828/...". Caught only because the round trip
// was actually exercised rather than assumed.
//
// Run: npm run test:instagram

import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";

const { imageLedgerKey } = await import("./instagramBot.js");

const PATH = "comicvine/rai/vol-4828/1-issue-1.jpg";

test("a public URL and the bare storage path produce the same key", () => {
  const fromUrl = imageLedgerKey(
    `https://example.supabase.co/storage/v1/object/public/canonical-covers/${PATH}`
  );
  const fromPath = imageLedgerKey(PATH);
  assert.equal(fromUrl, `img:${PATH}`);
  assert.equal(fromPath, `img:${PATH}`);
  assert.equal(fromUrl, fromPath, "picker and recorder must agree or the guard never fires");
});

test("the bucket name does not change the key", () => {
  // Brand cards live in comic-covers, comic covers in canonical-covers.
  // The same file reached through either must collapse to one key.
  const a = imageLedgerKey(`https://example.supabase.co/storage/v1/object/public/canonical-covers/${PATH}`);
  const b = imageLedgerKey(`https://example.supabase.co/storage/v1/object/public/comic-covers/${PATH}`);
  assert.equal(a, b);
});

test("different covers produce different keys", () => {
  assert.notEqual(
    imageLedgerKey("comicvine/rai/vol-4828/1-issue-1.jpg"),
    imageLedgerKey("comicvine/rai/vol-4828/2-issue-2.jpg")
  );
});

test("empty and missing inputs are null, not a key that matches everything", () => {
  // A key of "img:" would match any other empty input and could wedge the
  // picker into skipping every candidate.
  assert.equal(imageLedgerKey(null), null);
  assert.equal(imageLedgerKey(undefined), null);
  assert.equal(imageLedgerKey(""), null);
  assert.equal(imageLedgerKey("   "), null);
});

test("a leading slash does not create a second key for the same file", () => {
  assert.equal(imageLedgerKey(`/${PATH}`), imageLedgerKey(PATH));
});
