import assert from "node:assert/strict";
import test from "node:test";
import { chooseSkippedCandidate, publisherMatches } from "./publisherMatch.js";

test("publisherMatches normalizes names and known aliases", () => {
  assert.equal(publisherMatches("DC Comics", "DC"), true);
  assert.equal(publisherMatches("DC Comics", "Panini Deutschland"), false);
  assert.equal(publisherMatches("Marvel", "Marvel Comics"), true);
  assert.equal(publisherMatches("", "Marvel Comics"), false);
  assert.equal(publisherMatches("Gold Key", "Western"), true);
});

test("publisherMatches keeps foreign editions apart", () => {
  assert.equal(publisherMatches("Marvel", "Marvel UK"), false);
  assert.equal(publisherMatches("Dark Horse Comics", "Dark Horse Deutschland"), false);
  assert.equal(publisherMatches("DC Comics", "D.C. Thomson"), false);
});

test("publisher tiebreak selects the only publisher match above the overlap gate", () => {
  const result = chooseSkippedCandidate({
    skipReason: "ambiguous", volumeTitle: "Nightwing", volumePublisher: "DC Comics", startYear: 2016,
    candidates: [
      { gcdId: 104515, overlap: 0.97, publisherName: "DC", country: "us", name: "Nightwing", yearBegan: 2016 },
      { gcdId: 113473, overlap: 0.96, publisherName: "Panini Deutschland", country: "de", name: "Nightwing", yearBegan: 2017 },
    ],
  });
  assert.equal(result?.winner.gcdId, 104515);
  assert.equal(result?.reason, "publisher tiebreak");
});

test("title+publisher+year selects one conservative lower-overlap match", () => {
  const result = chooseSkippedCandidate({
    skipReason: "no_candidate", volumeTitle: "Example!", volumePublisher: "Marvel Comics", startYear: 2024,
    candidates: [
      { gcdId: 1, overlap: 0.70, publisherName: "Marvel", name: "Example", yearBegan: 2024 },
      { gcdId: 2, overlap: 0.95, publisherName: "Panini", name: "Example", yearBegan: 2024 },
    ],
  });
  assert.equal(result?.winner.gcdId, 1);
  assert.equal(result?.reason, "title+publisher+year");
});

test("Nightwing resolves to the 2016 DC run", () => {
  const result = chooseSkippedCandidate({
    skipReason: "no_candidate", volumeTitle: "Nightwing", volumePublisher: "DC Comics", startYear: 2016,
    candidates: [
      { gcdId: 104515, overlap: 0.97, publisherName: "DC", country: "us", name: "Nightwing", yearBegan: 2016 },
      { gcdId: 111678, overlap: 0.40, publisherName: "DC", country: "us", name: "Nightwing", yearBegan: 2017 },
      { gcdId: 113473, overlap: 0.30, publisherName: "Panini Deutschland", country: "de", name: "Nightwing", yearBegan: 2017 },
    ],
  });
  assert.equal(result?.winner.gcdId, 104515);
});

test("title+publisher+year refuses multiple qualifying candidates", () => {
  const result = chooseSkippedCandidate({
    skipReason: "same_start_year", volumeTitle: "Nightwing", volumePublisher: "DC Comics", startYear: 2016,
    candidates: [
      { gcdId: 1, overlap: 0.70, publisherName: "DC", name: "Nightwing", yearBegan: 2016 },
      { gcdId: 2, overlap: 0.65, publisherName: "DC", name: "Nightwing", yearBegan: 2017 },
    ],
  });
  assert.equal(result, null);
});
