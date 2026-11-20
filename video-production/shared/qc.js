import { formatTime, segmentAssets } from "./timeline.js";

export const TEXT_ONLY_TYPES = new Set(["title", "chapter", "end", "sting"]);
export const ANIMATED_CARD_TYPES = new Set(["dossier", "packOpen", "retroCard", "pair", "grid", "fan", "stack", "shelf", "shelfLater", "tracklist", "rotatePage"]);
// Calibrated in 8-bit luma: normal antialiasing stays below 4 levels, while a
// visible one-pixel light-line flash exceeds 12. This leaves 3x headroom.
export const FLICKER_EDGE_DELTA = 12;

export function textOnlySegments(segments) {
  return segments.filter((s) => TEXT_ONLY_TYPES.has(s.type) && segmentAssets(s).length === 0);
}

const clean = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9'-]/g, "");
const context = (words, i, n = 1) => words.slice(Math.max(0, i - 3), Math.min(words.length, i + n + 3)).map((w) => w.w).join(" ");

export function findRetakeSuspects(words, { longWord = 1.2, longGap = 2.5, repeatWindow = 12 } = {}) {
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.e - w.s > longWord) out.push({ kind: "long word", time: w.s, text: context(words, i) });
    const section = (x) => x.section ?? x.short ?? x.cam ?? null;
    if (i && section(words[i - 1]) === section(w) && w.s - words[i - 1].e > longGap) {
      out.push({ kind: "gap", time: words[i - 1].e, text: context(words, i - 1, 2) });
    }
  }
  for (let i = 0; i < words.length - 2; i++) {
    for (let len = 3; len <= 8 && i + len <= words.length; len++) {
      const phrase = words.slice(i, i + len).map((w) => clean(w.w)).join(" ");
      if (!phrase.trim()) continue;
      for (let j = i + len; j + len <= words.length && words[j].s - words[i].s <= repeatWindow; j++) {
        if (words.slice(j, j + len).map((w) => clean(w.w)).join(" ") === phrase) {
          out.push({ kind: "repeat", time: words[j].s, text: context(words, j, len) });
          i = j + len - 1;
          len = 99;
          break;
        }
      }
    }
  }
  return out;
}

export function findZeroRuns(samples, sampleRate, { ignoreStart = 0.5, ignoreEnd = 0.5, minimum = 0.03 } = {}) {
  const first = Math.ceil(ignoreStart * sampleRate);
  const last = Math.max(first, samples.length - Math.ceil(ignoreEnd * sampleRate));
  const needed = Math.ceil(minimum * sampleRate);
  const runs = [];
  let start = -1;
  for (let i = first; i <= last; i++) {
    const zero = i < last && samples[i] === 0;
    if (zero && start < 0) start = i;
    if (!zero && start >= 0) {
      if (i - start >= needed) runs.push({ start: start / sampleRate, end: i / sampleRate, duration: (i - start) / sampleRate });
      start = -1;
    }
  }
  return runs;
}

// A flicker is a flash: an edge that jumps one way for one or two frames and
// comes back. A fade moves one way and stays, so it scores 0 here. Ep 007's two
// fade-through-background transitions (1:16.4, 11:58.3) failed the plain
// frame-to-frame delta below although nothing on screen blinked.
export function maximumFlashDelta(frames) {
  let max = 0;
  for (let i = 1; i < frames.length - 1; i++) {
    for (let edge = 0; edge < frames[i].length; edge++) {
      const v = frames[i][edge], before = frames[i - 1][edge];
      for (const after of [frames[i + 1][edge], frames[i + 2]?.[edge]]) {
        if (after === undefined) continue;
        const up = Math.min(v - before, v - after);
        const down = Math.min(before - v, after - v);
        max = Math.max(max, up, down);
      }
    }
  }
  return max;
}

export function maximumFrameDelta(frames) {
  let max = 0;
  for (let i = 1; i < frames.length; i++) max = Math.max(max, ...frames[i].map((v, edge) => Math.abs(v - frames[i - 1][edge])));
  return max;
}

export function kenBurnsWindow(treatment, focus = {}, progress = 0) {
  const W = 1920, H = 1080, coverH = W / 0.66;
  const f = { x: 0.5, y: 0.35, zoom: 1.6, ...focus };
  let scale = 1, x = 0, y;
  const clamp = () => {
    y = Math.min(0, Math.max(-(coverH * scale - H), y));
    x = Math.min(0, Math.max(-(W * scale - W), x));
  };
  if (treatment === "panUp") y = -(coverH - H) * (1 - progress);
  else if (treatment === "panDown") y = -(coverH - H) * progress;
  else if (treatment === "panAcross") {
    scale = f.zoom; y = -(f.y * coverH * scale - H / 2); x = -(W * scale - W) * (f.reverse ? 1 - progress : progress); clamp();
  } else {
    const t = treatment === "focusOut" ? 1 - progress : progress;
    scale = 1 + (f.zoom - 1) * t;
    const sy = treatment === "zoomTo" ? f.y * coverH : coverH / 2;
    y = -(sy - H / 2) + (-(f.y * coverH * f.zoom - H / 2) + sy - H / 2) * t;
    x = -(f.x * W * f.zoom - W / 2) * t; clamp();
  }
  return { left: -x / scale / W, top: -y / scale / coverH, width: 1 / scale, height: H / scale / coverH };
}

export function formatSuspect(s) { return `${formatTime(s.time)} ${s.kind}: ${s.text}`; }
