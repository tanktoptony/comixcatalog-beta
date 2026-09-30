// Timeline engine. An episode is data, not JSX: a list of segments with an
// editorial start time, a component type, and that component's props.
//
//   { at: "4:05", type: "cover", asset: "covers/x-men-129-1980.jpg",
//     treatment: "slowPush", title: "1. The Dark Phoenix Saga" }
//
// Times are editorial targets. They will drift from the final narration, so
// retiming must be cheap:
//   - a segment runs until the next one starts unless it sets `dur`
//   - `nudges` shift every segment at or after a point, so "everything from
//     6:10 on is 1.5s late" is one line, not forty edits
//
// Pure module (no Remotion imports) so it runs under node --test and in the
// asset/missing-asset scripts as well as inside the render.

export function parseTime(value) {
  if (typeof value === "number") return value;
  const parts = String(value).trim().split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Bad time "${value}" (use seconds or m:ss / h:mm:ss)`);
  }
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(s % 1 ? 1 : 0).padStart(2, "0");
  return `${m}:${rest}`;
}

function applyNudges(t, nudges) {
  let out = t;
  for (const n of nudges ?? []) {
    if (t >= parseTime(n.from)) out += Number(n.by) || 0;
  }
  return out;
}

// -> { fps, durationInFrames, segments: [{ ...seg, start, end, from, durationInFrames }] }
export function normalizeTimeline(episode, fps) {
  const total = parseTime(episode.duration);
  const raw = (episode.segments ?? []).map((seg, i) => ({
    ...seg,
    id: seg.id ?? `seg-${String(i + 1).padStart(3, "0")}`,
    start: applyNudges(parseTime(seg.at), episode.nudges),
  }));

  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i].start < raw[i - 1].start) {
      throw new Error(
        `Segments out of order: ${raw[i].id} at ${formatTime(raw[i].start)} comes before ${raw[i - 1].id} at ${formatTime(raw[i - 1].start)}`
      );
    }
  }

  const segments = raw.map((seg, i) => {
    const nextStart = i + 1 < raw.length ? raw[i + 1].start : total;
    const end = seg.dur != null ? seg.start + Number(seg.dur) : nextStart;
    if (end > nextStart + 1e-6) {
      throw new Error(`${seg.id} (${formatTime(seg.start)}) runs past the next segment at ${formatTime(nextStart)}; shorten dur`);
    }
    const from = Math.round(seg.start * fps);
    const durationInFrames = Math.max(1, Math.round(end * fps) - from);
    return { ...seg, end, from, durationInFrames };
  });

  return { fps, durationInFrames: Math.round(total * fps), segments };
}

// Every asset a segment points at, in one list. Components take either
// `asset` (one) or `assets` (several); shelf items and pairs use objects.
export function segmentAssets(seg) {
  const out = [];
  const push = (a) => {
    if (!a) return;
    if (typeof a === "string") out.push(a);
    else if (a.asset) out.push(a.asset);
  };
  push(seg.asset);
  push(seg.screenshot);
  push(seg.inset?.asset);
  for (const a of seg.assets ?? []) push(a);
  for (const a of seg.items ?? []) push(a);
  for (const a of seg.later ?? []) push(a);
  return out;
}

// "brand/wordmark.png" is shared; anything else lives under the episode.
export function assetPath(episodeId, asset) {
  if (asset.startsWith("brand/")) return asset;
  return `${episodeId}/${asset}`;
}

export const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm"];
export const isVideo = (path) => /\.(mp4|mov|webm)$/i.test(String(path ?? ""));
const hasExtension = (asset) => /\.[a-z0-9]+$/i.test(asset);

// An asset may be named without an extension ("extras/TAS_GAMBIT"): whatever
// arrives, .jpg, .png or .mp4, is used. Returns the public path or null.
export function resolveAsset(folder, asset, available) {
  const base = assetPath(folder, asset);
  if (hasExtension(asset)) return available.has(base) ? base : null;
  for (const ext of MEDIA_EXTENSIONS) if (available.has(`${base}.${ext}`)) return `${base}.${ext}`;
  return null;
}

// A segment may name a `fallback` the blueprint itself allows ("Fallback:
// real covers only"). It is used only when the primary asset is absent, and
// the primary is still reported missing.
export function withFallbacks(seg, folder, available) {
  if (!seg.fallback || !seg.asset || resolveAsset(folder, seg.asset, available)) return seg;
  return { ...seg, asset: seg.fallback, usingFallbackFor: seg.asset };
}

export function missingAssets(episode, available) {
  const have = available instanceof Set ? available : new Set(available);
  const folder = episode.assetEpisodeId ?? episode.id;
  const byAsset = new Map();
  for (const [i, seg] of (episode.segments ?? []).entries()) {
    const segId = seg.id ?? `seg-${String(i + 1).padStart(3, "0")}`;
    for (const asset of segmentAssets(seg)) {
      if (resolveAsset(folder, asset, have)) continue;
      const path = assetPath(folder, asset);
      const expected = hasExtension(asset) ? path : `${path}.(jpg|png|webp|mp4|mov)`;
      if (!byAsset.has(path)) byAsset.set(path, { asset, expected, usedBy: [] });
      byAsset.get(path).usedBy.push({
        segment: segId,
        at: String(seg.at),
        type: seg.type,
        ...(seg.need ? { need: seg.need } : {}),
        ...(seg.fallback && asset === seg.asset ? { fallbackInUse: seg.fallback } : {}),
      });
    }
  }
  return [...byAsset.values()];
}
