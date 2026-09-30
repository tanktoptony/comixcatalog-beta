// Episode 001: "Where to Start Reading X-Men Without Losing Your Mind"
//
// The shot list comes from episode001_visual_edit_blueprint.md and nothing
// else. That file has not been provided yet, so `segments` is empty and
// scripts/render.mjs refuses to render this episode until it is filled in.
//
// Segment shape (see shared/timeline.js and shared/EpisodeRenderer.jsx):
//   { at: "4:05", type: "cover", asset: "covers/x-men-129-1980.jpg",
//     treatment: "slowPush", kicker: "1", title: "The Dark Phoenix Saga" }
// Assets resolve under public/episode-001/ (covers/, tas/, screenshots/...);
// "brand/..." resolves to the shared brand folder. Anything referenced but
// not on disk renders as a labeled [MISSING: file] placeholder and is listed
// in output/episode-001-missing-assets.json.
//
// After comparing against the final narration, retime with `nudges`
// (e.g. { from: "6:10", by: 1.5 }) instead of editing every `at`.

export default {
  id: "episode-001",
  compositionId: "Episode001",
  title: "Where to Start Reading X-Men Without Losing Your Mind",
  duration: "16:11",
  blueprint: "episode001_visual_edit_blueprint.md",
  nudges: [],
  segments: [],
};
