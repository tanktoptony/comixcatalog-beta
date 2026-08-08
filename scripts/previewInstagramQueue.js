// Preview the next N days of Instagram bot picks without posting anything
// or touching the real de-dup ledger — reuses the actual selection logic
// from instagramBot.js so the preview matches real behavior exactly.
//
// Usage: node scripts/previewInstagramQueue.js [count]   (default 10)

import {
  loadLedger,
  pickCoverSpotlight,
  pickNewToCatalog,
  pickValueCheck,
  pickBrandPost,
  buildCaption,
  buildBrandCaption,
  coverPriceForYear,
  synopsisFromDescription,
} from "./instagramBot.js";

const COUNT = Number(process.argv[2]) || 10;

// Same rotation as the real bot: today's real day-of-epoch index, then +1
// per simulated day, so the preview matches what the cron would actually
// pick (and how it would rotate CTA/hashtags) on each of the next N real
// days. Kept as the raw epoch day (not yet mod pickers.length) so it can
// feed both the picker-order rotation and buildCaption's own rotation below.
// Mirrors selectPost()'s 7-slot cycle in instagramBot.js — keep in sync.
const epochDay = Math.floor(Date.now() / 86400000);
const pickers = [
  pickCoverSpotlight, pickNewToCatalog, pickValueCheck,
  pickCoverSpotlight, pickNewToCatalog, pickValueCheck,
  pickBrandPost,
];

async function selectForDay(dayOffset, seenKeys) {
  const dayIndex = (epochDay + dayOffset) % pickers.length;
  const order = [...pickers.slice(dayIndex), ...pickers.slice(0, dayIndex)];
  for (const picker of order) {
    const post = await picker(seenKeys);
    if (post) return post;
  }
  return null;
}

async function run() {
  // Start from the REAL current ledger (read-only) so the preview correctly
  // excludes anything already posted, but never writes back to it.
  const seenKeys = loadLedger();

  for (let day = 0; day < COUNT; day++) {
    const post = await selectForDay(day, seenKeys);
    console.log(`\n${"=".repeat(60)}\nDay ${day + 1}${post ? "" : " — NO ELIGIBLE CONTENT (queue exhausted for this type)"}\n${"=".repeat(60)}`);
    if (!post) continue;

    seenKeys.add(post.dedupeKey); // simulate this day's pick being "used"

    let caption;
    if (post.type === "Brand") {
      caption = buildBrandCaption({
        kicker: post.kicker,
        headline: post.headline,
        captionBody: post.captionBody,
        dayIndex: epochDay + day,
      });
    } else {
      const kicker = {
        "Cover Spotlight": "✦ Cover Spotlight",
        "New to the Catalog": "✦ New to the Catalog",
        "Key Issue Value Check": "✦ Value Check",
      }[post.type];
      const valueLine = post.valueInfo
        ? `Est. value (raw NM-ish, ${post.valueInfo.sampleSize} sales): $${post.valueInfo.value.toFixed(0)}`
        : post.type === "Key Issue Value Check"
          ? null
          : (() => {
              const floor = coverPriceForYear(post.year);
              return floor ? `Est. cover-price floor: $${floor.toFixed(2)}` : null;
            })();

      caption = buildCaption({
        title: post.title,
        issueNumber: post.issueNumber,
        year: post.year,
        publisher: post.publisher,
        valueLine,
        kicker,
        postType: post.type,
        synopsis: synopsisFromDescription(post.description),
        dayIndex: epochDay + day,
      });
    }

    console.log(`Type: ${post.type}`);
    console.log(`Image: ${post.imageUrl}`);
    console.log(`Caption:\n${caption}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
