import test from "node:test";
import assert from "node:assert/strict";
import { creditsForIssue, parseCreditNames, slugify, storyRows } from "./gcdCredits.js";

const sample = { story_set: [
  { type: "cover", sequence_number: 0, pencils: "Pat Lee (signed)", inks: "Alvin Lee (signed)", colors: "?", page_count: "1.000" },
  { type: "comic story", sequence_number: 1, title: "Chapter One: Ladies in Waiting", script: "Tom Sniegoski; Christopher Golden", pencils: "Pat Lee", inks: "Alvin Lee", colors: "Angelo Tsang; Pat Lee", letters: "Richard Starkings; Comicraft", page_count: "22.000" },
  { type: "in-house column", sequence_number: 2, feature: "Bullpen Bulletins", script: "Stan Lee; ?", letters: "typeset" },
] };

test("parses and normalizes credit names", () => {
  assert.deepEqual(parseCreditNames(" None; ?; typeset; various; Pat Lee (signed); Jim Lee [as J. Lee]; Stan Lee ?; Pat Lee "), ["Pat Lee", "Jim Lee", "Stan Lee"]);
});

test("extracts story and cover credits while excluding columns", () => {
  assert.deepEqual(creditsForIssue(sample), [
    { name: "Pat Lee", role: "cover" }, { name: "Alvin Lee", role: "cover" },
    { name: "Tom Sniegoski", role: "writer" }, { name: "Christopher Golden", role: "writer" },
    { name: "Pat Lee", role: "penciller" }, { name: "Alvin Lee", role: "inker" },
    { name: "Angelo Tsang", role: "colorist" }, { name: "Pat Lee", role: "colorist" },
    { name: "Richard Starkings", role: "letterer" }, { name: "Comicraft", role: "letterer" },
  ]);
  assert.equal(creditsForIssue(sample).some(({ name }) => name === "Stan Lee"), false);
});

test("includes text stories and pin-ups but not filler", () => {
  const issue = { story_set: [
    { type: "text story", script: "Writer One" }, { type: "illustration", pencils: "Artist One" },
    { type: "letters page", script: "Editor One" }, { type: "advertisement", pencils: "Artist Two" },
  ] };
  assert.deepEqual(creditsForIssue(issue), [{ name: "Writer One", role: "writer" }, { name: "Artist One", role: "penciller" }]);
});

test("slugifies accents deterministically", () => assert.equal(slugify("José García, Jr."), "jose-garcia-jr"));
test("handles an empty story set", () => { assert.deepEqual(creditsForIssue({ story_set: [] }), []); assert.deepEqual(storyRows(1, {}), []); });
test("builds normalized story rows", () => {
  const [row] = storyRows(89805, { story_set: [{ sequence_number: 0, type: "cover", title: "None", feature: "?", script: "None", page_count: "1.000" }] });
  assert.equal(row.gcd_issue_id, 89805); assert.equal(row.page_count, 1); assert.equal(row.title, null); assert.equal(row.feature, null); assert.equal(row.script, null);
});
