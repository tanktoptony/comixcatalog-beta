// Every renderable timeline. Add an episode here and it gets a composition,
// a render command, and a missing-assets report.

import episode001 from "./episode-001/timeline.js";
import episode001v2 from "./episode-001/timeline.v2.js";
import demo from "./demo/timeline.js";

export const EPISODES = [episode001, episode001v2, demo];

// Folder under public/ that an episode's assets live in.
export const assetFolder = (ep) => ep.assetEpisodeId ?? ep.id;
