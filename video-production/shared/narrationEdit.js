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
  const cuts = [...(edit.cuts ?? [])].sort((a, b) => a[0] - b[0]);
  const keep = [];
  let cursor = edit.start ?? 0;
  for (const [a, b] of cuts) {
    if (a > cursor) keep.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < total) keep.push([cursor, total]);

  let out = 0;
  const clips = keep.map(([from, to]) => {
    const c = { from, to, out };
    out += to - from;
    return c;
  });
  const words = [];
  for (const w of transcript.words) {
    const c = clips.find((k) => w.s >= k.from && w.s < k.to);
    if (!c) continue;
    const shift = c.out - c.from;
    words.push({ ...w, s: +(w.s + shift).toFixed(3), e: +(Math.min(w.e, c.to) + shift).toFixed(3) });
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
