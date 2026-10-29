import assert from "node:assert/strict";
import test from "node:test";

import { matchTradeVolumes } from "./tradeVolumeMatch.js";

const edition = (values = {}) => ({ gcd_id: 1, title: "Example", publisher: "Image Comics", year_start: 2020, issue_count: 6, tag: "TPB", ...values });
const candidate = (values = {}) => ({ id: 10, name: "Example", start_year: 2020, count_of_issues: 6, publisher: { name: "Image" }, description: "Trade paperback collecting the series.", deck: "", ...values });

test("matches the separate Wicked + The Divine trade and hardcover volumes", () => {
  const editions = [
    edition({ gcd_id: 98792, title: "The Wicked + The Divine", year_start: 2014, issue_count: 9 }),
    edition({ gcd_id: 104218, title: "The Wicked + The Divine", year_start: 2016, issue_count: 4, tag: "HC" }),
  ];
  const candidates = [
    candidate({ id: 74863, name: "The Wicked + The Divine", start_year: 2014, count_of_issues: 45, description: "Forty-five issue series..." }),
    candidate({ id: 78071, name: "The Wicked + The Divine", start_year: 2014, count_of_issues: 9, description: "Series of trade paperbacks collecting..." }),
    candidate({ id: 89396, name: "The Wicked + The Divine", start_year: 2016, count_of_issues: 4, description: "Series of hardcovers collecting..." }),
    candidate({ id: 96526, name: "The Wicked + The Divine", start_year: 2016, count_of_issues: 4, publisher: { name: "Éditions Glénat" } }),
    candidate({ id: 140510, name: "The Wicked + The Divine", start_year: 2017, count_of_issues: 9, publisher: { name: "Norma" } }),
  ];
  const result = matchTradeVolumes({ editions, candidates, pinnedVolumeIds: new Set() });
  assert.deepEqual(result.matches.map(({ gcd_id, volume_id }) => ({ gcd_id, volume_id })), [
    { gcd_id: 98792, volume_id: 78071 },
    { gcd_id: 104218, volume_id: 89396 },
  ]);
  assert.equal(result.matches.some(({ volume_id }) => [74863, 96526, 140510].includes(volume_id)), false);
});

test("does not reuse an already pinned volume", () => {
  const result = matchTradeVolumes({ editions: [edition()], candidates: [candidate()], pinnedVolumeIds: new Set([10]) });
  assert.deepEqual(result, { matches: [], skipped: [{ gcd_id: 1, reason: "pinned" }] });
});

test("skips an edition when its best candidates tie", () => {
  const result = matchTradeVolumes({ editions: [edition()], candidates: [candidate(), candidate({ id: 11 })], pinnedVolumeIds: new Set() });
  assert.deepEqual(result, { matches: [], skipped: [{ gcd_id: 1, reason: "ambiguous" }] });
});

test("loosely matches publisher suffixes and punctuation", () => {
  for (const [left, right] of [["Image", "Image Comics"], ["DC Comics", "DC"], ["BOOM! Studios", "Boom Studios Publishing, Inc."]]) {
    const result = matchTradeVolumes({ editions: [edition({ publisher: left })], candidates: [candidate({ publisher: { name: right } })], pinnedVolumeIds: new Set() });
    assert.equal(result.matches.length, 1, `${left} should match ${right}`);
  }
});

test("format disagreement penalty selects the matching trade paperback", () => {
  const candidates = [
    candidate({ id: 10, description: "Hardcover collection." }),
    candidate({ id: 11, description: "Trade paperback collection.", count_of_issues: 5 }),
  ];
  const result = matchTradeVolumes({ editions: [edition()], candidates, pinnedVolumeIds: new Set() });
  assert.equal(result.matches[0].volume_id, 11);
  assert.equal(result.matches[0].score, 15);
});


test("a monthly whose description lists its trades late is not a trade volume", () => {
  const editions = [{ gcd_id: 1, title: "Paper Girls", publisher: "Image Comics", year_start: 2016, issue_count: 1, tag: "TPB" }];
  const filler = "Paper Girls is a series about four newspaper delivery girls. ".repeat(8);
  const candidates = [{
    id: 500, name: "Paper Girls", start_year: 2016, count_of_issues: 1, publisher: { name: "Image" },
    description: `<p>${filler}</p><h2>Collected Editions</h2><p>Paper Girls Vol. 1 (TPB) collects #1-5.</p>`, deck: null,
  }];
  const result = matchTradeVolumes({ editions, candidates, pinnedVolumeIds: new Set() });
  assert.deepEqual(result.matches, []);
  assert.equal(result.skipped[0].reason, "not-collected");
});

test("a lone candidate whose format disagrees is skipped, not matched", () => {
  const editions = [{ gcd_id: 7, title: "The Amazing Spider-Man", publisher: "Simon and Schuster", year_start: 1979, issue_count: 0, tag: "TPB" }];
  const candidates = [{
    id: 900, name: "The Amazing Spider-Man", start_year: 1979, count_of_issues: 1, publisher: { name: "Simon and Schuster" },
    description: "HC Collecting The Amazing Spider-Man (1963) #42-43.", deck: null,
  }];
  const result = matchTradeVolumes({ editions, candidates, pinnedVolumeIds: new Set() });
  assert.deepEqual(result.matches, []);
  assert.equal(result.skipped[0].reason, "format");
});
