import test from "node:test";
import assert from "node:assert/strict";
import { validateEpisodeConfig } from "./episodeConfig.js";

const valid = {
  id: "episode-002", number: 2, slug: "test", titleOptions: ["Title"], narrator: "tony-human", utmCampaign: "ep002",
  sections: [{ id: "01-hook", chapter: "Start" }], books: [{ label: "Book", request: "Book #1", searchQuery: "book" }],
  tags: [], descriptionIntro: "Intro", pinnedComment: "Comment", credits: [], shorts: [{ id: "s1", title: "Short", hook: "Hook" }],
};

test("validates a complete episode config", () => {
  const copy = structuredClone(valid);
  assert.equal(validateEpisodeConfig(copy), copy);
});
test("reports useful field paths for invalid config", () => {
  const bad = structuredClone(valid);
  bad.id = "episode-7";
  bad.sections[0].chapter = 42;
  assert.throws(() => validateEpisodeConfig(bad, "fixture.json"), /fixture\.json: id must be "episode-002"[\s\S]*sections\[0\]\.chapter must be a non-empty string or null/);
});
