import test from "node:test";
import assert from "node:assert/strict";
import { chaptersFromSections, chapterText } from "./chapters.js";

test("chapters use configured labels and recorded section starts", () => {
  const config = { sections: [{ id: "01-hook", chapter: "Hook" }, { id: "02-transition", chapter: null }, { id: "03-topic", chapter: "Topic" }] };
  const chapters = chaptersFromSections(config, { sections: [{ id: "01-hook", start: 0 }, { id: "02-transition", start: 8.2 }, { id: "03-topic", start: 65.9 }] });
  assert.deepEqual(chapters, [{ label: "Hook", at: 0 }, { label: "Topic", at: 65.9 }]);
  assert.equal(chapterText(chapters), "0:00 Hook\n1:05 Topic");
});
