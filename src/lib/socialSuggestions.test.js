import assert from "node:assert/strict";
import test from "node:test";
import { mergeSuggestionReasons, rankSuggestionSections } from "./socialSuggestions.js";

test("merges duplicate people using the strongest scored reason", () => {
  const rows = [
    { user_id: "a", reason_kind: "same_location", score: 10 },
    { user_id: "a", reason_kind: "shared_runs", score: 80 },
    { user_id: "b", reason_kind: "followed_by", score: 50 },
  ];
  assert.deepEqual(mergeSuggestionReasons(rows).map((row) => row.reason_kind), ["shared_runs", "followed_by"]);
});

test("ranks deterministically and builds focused sections", () => {
  const rows = [
    { user_id: "b", reason_kind: "same_publisher", score: 25 },
    { user_id: "a", reason_kind: "shared_runs", score: 70 },
  ];
  const sections = rankSuggestionSections(rows);
  assert.deepEqual(sections.peopleYouMayKnow.map((row) => row.user_id), ["a", "b"]);
  assert.equal(sections.publisherCollectors.length, 1);
  assert.equal(sections.sharedRuns.length, 1);
});
