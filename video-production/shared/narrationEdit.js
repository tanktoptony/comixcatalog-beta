// Apply an edit decision list (lead-in trim + cut ranges) to a narration
// transcript, so anchors, captions and the audio all follow the edited voice.
//
// applyEdit(transcript, edit) ->
//   { words, duration, clips: [{ from, to, out }] }
// words:    transcript words inside kept ranges, re-timed to edited time
// duration: edited length in seconds
// clips:    kept source ranges [from, to) and where each starts (out) in
//           edited time; the renderer plays them back to back.
//
// insertGap(clips, outFrom, outTo, gap) removes edited time [outFrom, outTo)
// and opens a `gap`-second hole there (for Tony's on-camera spot), returning
// new clips; times after it shift by gap - (outTo - outFrom).

export function applyEdit(transcript, edit) {
  const total = transcript.duration;
  if (!edit) {
    return { words: transcript.words, duration: total, clips: [{ from: 0, to: total, out: 0 }] };
  }
  // Retake cuts and shortened pauses may overlap; overlaps merge here.
  const cuts = [...(edit.cuts ?? []), ...(edit.pauses ?? [])].sort((a, b) => a[0] - b[0]);
  const keep = [];
  let cursor = edit.start ?? 0;
  for (const [a, b] of cuts) {
    // Slivers under 50 ms between two cuts are dropped rather than played.
    if (a > cursor + 0.05) keep.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < total) keep.push([cursor, total]);

  let out = 0;
  const clips = keep.map(([from, to]) => {
    const c = { from, to, out };
    out += to - from;
    return c;
  });
  // patches: [{ from, to, words }] replace the transcript's words in
  // [from, to) with hand-checked ones (e.g. a retake the full-file pass timed
  // on the wrong take).
  let source = transcript.words;
  for (const p of edit.patches ?? []) {
    source = [...source.filter((w) => w.s < p.from || w.s >= p.to), ...p.words];
  }
  source = [...source].sort((a, b) => a.s - b.s);
  const words = [];
  for (const w of source) {
    // Transcript timings are loose: a word whose start lands just inside a
    // trimmed pause but runs on into kept audio snaps to that clip's start.
    const c = clips.find((k) => w.s >= k.from && w.s < k.to) ?? clips.find((k) => k.from > w.s && k.from < w.e - 0.05);
    if (!c) continue;
    const shift = c.out - c.from;
    const s = Math.max(w.s, c.from);
    words.push({ ...w, s: +(s + shift).toFixed(3), e: +(Math.min(w.e, c.to) + shift).toFixed(3) });
  }
  return { words, duration: +out.toFixed(3), clips };
}

export function insertGap(clips, outFrom, outTo, gap) {
  const delta = gap - (outTo - outFrom);
  const res = [];
  for (const c of clips) {
    const len = c.to - c.from;
    const cStart = c.out;
    const cEnd = c.out + len;
    // Part before the removed span.
    if (cStart < outFrom) {
      const end = Math.min(cEnd, outFrom);
      res.push({ from: c.from, to: c.from + (end - cStart), out: cStart });
    }
    // Part after it, shifted.
    if (cEnd > outTo) {
      const start = Math.max(cStart, outTo);
      res.push({ from: c.from + (start - cStart), to: c.to, out: start + delta });
    }
  }
  return res;
}
