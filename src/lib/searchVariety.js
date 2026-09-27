// Stop one title monopolising the results.
//
// Measured live on 2026-09-27, every one of the twelve results for
// "spider-man" was a series titled exactly "Spider-Man":
//
//    98 iss  1990  Spider-Man
//    61 iss  2022  Spider-Man
//    37 iss  2023  Spider-Man
//    ...
//
// None of the books anyone means. All of them exist, with covers:
//
//   650 iss  1963  The Amazing Spider-Man
//   264 iss  1976  The Spectacular Spider-Man
//   133 iss  2000  Ultimate Spider-Man
//   131 iss  1985  Web of Spider-Man
//
// "batman" was worse: twelve rows called Batman, and Detective Comics —
// 887 issues, the biggest Batman run there is — nowhere in them.
//
// The cause is that exact title match is the first key in compareSeries, so
// one exact-title cluster fills the page. Raising the result cap does not
// fix it: you would get Detective Comics at position 30, behind twenty-nine
// volumes called Batman.
//
// This is the same crowding bug fixed in the contribute lookup, where six
// minor series buried the 650-issue Amazing Spider-Man. Different endpoint,
// same root cause.
//
// The rule: a collector typing a character's name wants the SHAPE of that
// character's shelf — which runs exist — not every volume of one of them.
// So cap how many results share a title, and spend the rest of the page on
// different titles. Ordering within a title is untouched; this only decides
// how many of each survive.

// Titles differ meaningfully by more than articles, so this is a looser key
// than the search route's scoring normaliser: "The Amazing Spider-Man" and
// "Amazing Spider-Man" are the same shelf, "Spectacular Spider-Man" is not.
export function titleFamily(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * @param {Array} rows      already ranked best-first
 * @param {object} opts
 * @param {number} opts.limit       how many to return
 * @param {number} opts.perTitle    max rows sharing one title family
 * @returns {Array}
 *
 * Runs in passes. The first pass takes up to `perTitle` of each family in
 * rank order, which gives breadth immediately. If that does not fill the
 * page — a genuinely narrow query like "rai and the future force" where only
 * one family exists — later passes relax the cap rather than return a short
 * list. Fewer good results is a worse outcome than a few repeats.
 */
export function diversify(rows, { limit = 12, perTitle = 2 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length <= limit) return list.slice(0, limit);

  const out = [];
  const taken = new Set();
  const countByFamily = new Map();

  for (let pass = 1; out.length < limit && pass <= 6; pass += 1) {
    const allowance = perTitle * pass;
    for (const row of list) {
      if (out.length >= limit) break;
      if (taken.has(row)) continue;
      const fam = titleFamily(row?.title);
      const used = countByFamily.get(fam) ?? 0;
      if (used >= allowance) continue;
      countByFamily.set(fam, used + 1);
      taken.add(row);
      out.push(row);
    }
  }

  // A family with a huge allowance could still leave the page short if the
  // input was smaller than it looked. Top up in plain rank order.
  if (out.length < limit) {
    for (const row of list) {
      if (out.length >= limit) break;
      if (!taken.has(row)) { taken.add(row); out.push(row); }
    }
  }

  return out;
}

/**
 * Group ranked rows into title families, preserving rank order.
 *
 * ComicVine shows you a character's shelf rather than a flat list, and that
 * is the shape a collector is actually looking for: which RUNS exist, and
 * which volumes each run had. Thirty-six flat rows scan as a wall; the same
 * thirty-six under a dozen headings scan as a shelf.
 *
 * Grouping happens after diversify(), so the families are already the ones
 * worth showing. This only decides how they are presented.
 *
 * Returns [{ family, title, rows }] where:
 *   - group order follows the rank of each family's best row
 *   - rows inside a group stay in rank order
 *   - `title` is the best row's title, which is the one the ranker preferred
 *
 * The caller must render groups in this order and derive keyboard
 * navigation from the same flattened sequence, or the highlight will point
 * at a different row than the one under the cursor.
 */
export function groupByTitle(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const byFamily = new Map();
  for (const row of list) {
    const family = titleFamily(row?.title);
    if (!byFamily.has(family)) {
      byFamily.set(family, { family, title: row?.title ?? "", rows: [] });
    }
    byFamily.get(family).rows.push(row);
  }
  return [...byFamily.values()];
}

// The flattened sequence that matches how groups render. Keyboard
// navigation indexes into this, never into the ungrouped input.
export function flattenGroups(groups) {
  const out = [];
  for (const g of groups ?? []) out.push(...(g.rows ?? []));
  return out;
}
