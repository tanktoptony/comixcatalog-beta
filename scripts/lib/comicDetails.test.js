import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseComicVineIssue,
  chooseComicVineVolume,
  comicVineVolumeTitleVariants,
  fetchComicVineVolumes,
  groupComicVineCredits,
  issueNumberKey,
  shapeComicVineIssue,
} from "./comicDetails.js";

const comic = { series_title: "The Example", publisher: "Marvel", start_year: 2025 };
const volume = (overrides = {}) => ({ id: 10, name: "Example", publisher: { name: "Marvel Comics" }, start_year: 2025, ...overrides });

test("one exact title, publisher and near-year volume matches", () => {
  assert.equal(chooseComicVineVolume(comic, [volume()]).match.id, 10);
  assert.equal(chooseComicVineVolume(comic, [volume({ start_year: 2024 })]).match.id, 10);
});

test("volume title lookup tries the title with and without a leading The", async () => {
  assert.deepEqual(comicVineVolumeTitleVariants("The Example"), ["The Example", "Example"]);
  assert.deepEqual(comicVineVolumeTitleVariants("Example"), ["Example", "The Example"]);

  const filters = [];
  const cv = {
    async get(path, params) {
      assert.equal(path, "volumes");
      filters.push(params.filter);
      return params.filter === "name:The Example"
        ? { number_of_total_results: 1, results: [volume()] }
        : { number_of_total_results: 1, results: [volume({ id: 10, name: "The Example" })] };
    },
  };
  const result = await fetchComicVineVolumes(cv, "The Example");
  assert.deepEqual(filters, ["name:The Example", "name:Example"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(chooseComicVineVolume(comic, result.candidates).match.id, 10);
});

test("volume lookup pages with offsets until all results are returned", async () => {
  const offsets = [];
  const cv = {
    async get(path, params) {
      assert.equal(path, "volumes");
      offsets.push([params.filter, params.offset]);
      if (params.filter === "name:Example") {
        return params.offset === 0
          ? { number_of_total_results: 3, results: [volume({ id: 1 }), volume({ id: 2 })] }
          : { number_of_total_results: 3, results: [volume({ id: 3 })] };
      }
      return { number_of_total_results: 0, results: [] };
    },
  };
  const result = await fetchComicVineVolumes(cv, "Example", { pageSize: 2 });
  assert.deepEqual(offsets, [
    ["name:Example", 0],
    ["name:Example", 2],
    ["name:The Example", 0],
  ]);
  assert.deepEqual(result.candidates.map((row) => row.id), [1, 2, 3]);
});

test("volume lookup reports too many results only after reaching its cap", async () => {
  const offsets = [];
  const cv = {
    async get(_path, params) {
      offsets.push(params.offset);
      return {
        number_of_total_results: 5,
        results: [volume({ id: params.offset + 1 }), volume({ id: params.offset + 2 })],
      };
    },
  };
  const result = await fetchComicVineVolumes(cv, "Example", { pageSize: 2, maxResultsPerTitle: 4 });
  assert.deepEqual(offsets, [0, 2]);
  assert.match(result.reason, /too many ComicVine volumes/);
  assert.deepEqual(result.candidates, []);
});

test("volume matching skips disagreement and ambiguity", () => {
  assert.equal(chooseComicVineVolume(comic, [volume({ publisher: { name: "DC" } })]).match, null);
  assert.equal(chooseComicVineVolume(comic, [volume(), volume({ id: 11 })]).match, null);
  assert.equal(chooseComicVineVolume({ ...comic, start_year: null, release_year: 2025 }, [volume()]).match, null);
});

test("issue matching requires exactly one exact number", () => {
  assert.equal(chooseComicVineIssue("1", [{ id: 1, issue_number: "1" }, { id: 2, issue_number: "10" }]).match.id, 1);
  assert.equal(chooseComicVineIssue("1", [{ id: 1, issue_number: "1" }, { id: 2, issue_number: "1" }]).match, null);
  assert.equal(chooseComicVineIssue("1", [{ id: 1, issue_number: "Vol. 1" }]).match, null);
});

test("textual and volume-style issue numbers stay distinct", () => {
  assert.equal(issueNumberKey("  Vol.   1 "), "vol. 1");
  assert.equal(chooseComicVineIssue("Vol. 1", [{ id: 4, issue_number: "vol. 1" }]).match.id, 4);
  assert.equal(chooseComicVineIssue("Origins", [{ id: 5, issue_number: "ORIGINS" }]).match.id, 5);
});

test("person credits group by name and split comma-separated roles", () => {
  assert.deepEqual(groupComicVineCredits([
    { name: "Jane Doe", role: "writer, artist" },
    { name: " jane doe ", role: "Artist, editor" },
    { name: "John Smith", role: "letterer" },
  ]), [
    { name: "Jane Doe", roles: ["writer", "artist", "editor"] },
    { name: "John Smith", roles: ["letterer"] },
  ]);
});

test("issue shaping keeps structured facts and never contributor prose", () => {
  const shaped = shapeComicVineIssue({
    id: 99,
    name: "A Name",
    cover_date: "2025-03-01",
    store_date: "2025-02-26",
    person_credits: [{ name: "A Writer", role: "writer" }],
    character_credits: [{ name: "Hero" }, { name: "hero" }],
    story_arc_credits: [{ name: "The Arc" }],
    site_detail_url: "https://comicvine.gamespot.com/a/4000-99/",
    description: "Contributor-written description",
    deck: "Contributor-written deck",
  });
  assert.deepEqual(shaped.characters, ["Hero"]);
  assert.equal(shaped.description, undefined);
  assert.equal(shaped.deck, undefined);
  assert.deepEqual(Object.keys(shaped), [
    "comicvine_issue_id", "issue_name", "cover_date", "store_date", "credits", "characters", "story_arcs", "source_url",
  ]);
});

test("invalid ComicVine dates become null instead of invalid SQL dates", () => {
  const shaped = shapeComicVineIssue({ id: 1, cover_date: "2025-02-30", store_date: "2025-00-00" });
  assert.equal(shaped.cover_date, null);
  assert.equal(shaped.store_date, null);
});
