// Pure aggregation behind the "My Collection" share card. No I/O, so it is
// unit-tested directly (collectionStats.test.js); the API route does the
// loading and hands rows in.
//
// Input rows: { status: "owned" | "wishlist", seriesKey, publisher }
//   seriesKey  any stable per-series id (GCD series id, or a local title)
//   publisher  resolved publisher name, or null when unknown

const SUFFIXES = [/ comics$/i, / publishing$/i, / entertainment$/i, / studios$/i, / press$/i];

// "Marvel Comics" → "Marvel", "IDW Publishing" → "IDW". A 1080px card has
// room for about ten characters of label beside a bar.
export function shortPublisher(name) {
  let n = String(name ?? "").trim();
  if (!n) return "Other";
  for (const re of SUFFIXES) {
    const stripped = n.replace(re, "");
    if (stripped && stripped !== n) {
      n = stripped;
      break;
    }
  }
  return n.length > 14 ? `${n.slice(0, 13)}…` : n;
}

// Integer percentages that always sum to exactly 100 (largest remainder).
// Naive rounding gives 33/33/33 = 99 on a card someone is about to post.
export function percentages(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

// Top N publishers of OWNED books, the rest folded into "Other". Unknown
// publishers count toward "Other" rather than a fake name.
export function collectionStats(rows, { topN = 3 } = {}) {
  const owned = rows.filter((r) => r.status === "owned");
  const wanted = rows.filter((r) => r.status === "wishlist").length;

  const series = new Set(owned.map((r) => r.seriesKey).filter((k) => k != null && k !== ""));

  const byPublisher = new Map();
  let unknown = 0;
  for (const r of owned) {
    if (!r.publisher) {
      unknown += 1;
      continue;
    }
    const key = shortPublisher(r.publisher);
    byPublisher.set(key, (byPublisher.get(key) ?? 0) + 1);
  }

  const ranked = [...byPublisher.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked.slice(0, topN);
  const otherCount = unknown + ranked.slice(topN).reduce((a, [, c]) => a + c, 0);
  // "Other" can also be a real top publisher's short name only by accident;
  // merge rather than show two "Other" rows.
  const entries = top.filter(([name]) => name !== "Other");
  const mergedOther = otherCount + top.filter(([name]) => name === "Other").reduce((a, [, c]) => a + c, 0);
  if (mergedOther > 0) entries.push(["Other", mergedOther]);

  const pcts = percentages(entries.map(([, c]) => c));
  return {
    owned: owned.length,
    wanted,
    series: series.size,
    publishers: entries.map(([name, count], i) => ({ name, count, pct: pcts[i] })),
  };
}

// "TONY" → "TONY'S", "CHRIS" → "CHRIS'". Uppercased for the card title.
export function possessive(name) {
  const n = String(name ?? "").trim().toUpperCase();
  if (!n) return "MY";
  return n.endsWith("S") ? `${n}'` : `${n}'S`;
}
