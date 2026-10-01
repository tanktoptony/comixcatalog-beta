// Phrase anchors -> seconds, from a word-level transcript.
//
// A timeline written against a script (episode-001/timeline.v3.js) names the
// phrase each shot belongs to ("Graham Crackers", "Number two. Days of
// Future Past") instead of a timecode. Given the narration's word
// timestamps (scripts/transcribe.py), resolveAnchors finds each phrase in
// order and returns the time its first word starts. Re-record the narration,
// re-run the transcript, and every shot moves with the voice.
//
// Matching is forgiving on purpose: Whisper writes "#1" as "number one" or
// "1", drops hyphens, and mishears the odd proper noun. Each phrase is
// matched as a token sequence, in order, after the previous anchor, and the
// best window wins if at least 60% of its tokens line up. Misses are
// returned (never silently guessed) and placed halfway between neighbours so
// a preview still renders.

const NUMBER_WORDS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
};

export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((t) => NUMBER_WORDS[t] ?? t);
}

// Score how well `phrase` matches words starting at index i: walk the
// phrase tokens, allowing one skipped transcript word per phrase token.
function scoreAt(words, i, phrase) {
  let w = i;
  let hits = 0;
  for (const tok of phrase) {
    let found = false;
    for (let k = 0; k < 2 && w + k < words.length; k += 1) {
      if (words[w + k].t === tok) {
        hits += 1;
        w += k + 1;
        found = true;
        break;
      }
    }
    if (!found) w += 1;
  }
  return hits / phrase.length;
}

// words: [{ w, s, e }] from transcribe.py. anchors: phrase strings, in
// script order. Returns { times: [seconds|null], misses: [{ index, phrase }] }.
export function resolveAnchors(rawWords, anchors, { minScore = 0.6, lookahead = 400 } = {}) {
  // Split multi-token transcript words ("X-Men" -> "x", "men") so phrase
  // tokens and transcript tokens line up one to one.
  const words = [];
  for (const rw of rawWords) {
    for (const t of tokenize(rw.w)) words.push({ t, s: rw.s, e: rw.e });
  }
  const times = [];
  const misses = [];
  let cursor = 0;
  anchors.forEach((anchor, index) => {
    const phrase = tokenize(anchor);
    if (phrase.length === 0) {
      times.push(null);
      misses.push({ index, phrase: anchor });
      return;
    }
    let best = { score: 0, i: -1 };
    const stop = Math.min(words.length, cursor + lookahead);
    for (let i = cursor; i < stop; i += 1) {
      if (words[i].t !== phrase[0] && words[i + 1]?.t !== phrase[0]) continue;
      const score = scoreAt(words, i, phrase);
      if (score > best.score + 1e-9) best = { score, i };
      if (score === 1) break;
    }
    if (best.score >= minScore) {
      // If the first phrase token was the skipped one, start at the match.
      const start = words[best.i].t === phrase[0] ? best.i : best.i + 1;
      times.push(words[start].s);
      cursor = start + 1;
    } else {
      times.push(null);
      misses.push({ index, phrase: anchor });
    }
  });
  // A run of unresolved anchors is spread evenly between its resolved
  // neighbours, so order is kept and a preview still renders.
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] != null) continue;
    let end = i;
    while (end < times.length && times[end] == null) end += 1;
    const a = i > 0 ? times[i - 1] : 0;
    const b = end < times.length ? times[end] : a + 4 * (end - i + 1);
    const n = end - i;
    for (let j = 0; j < n; j += 1) times[i + j] = +(a + ((b - a) * (j + 1)) / (n + 1)).toFixed(3);
    i = end - 1;
  }
  return { times, misses };
}
