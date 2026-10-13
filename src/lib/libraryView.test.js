import assert from "node:assert/strict";
import test from "node:test";
import { buildLibraryItems, groupLibraryRows } from "./libraryView.js";

test("an owned row created outside the client remains visible before hydration", () => {
  const transferred = { id: "b3ea4e78-5f6c-48d0-9544-b11bf9788c52", status: "owned", gcd_issue_id: 370589, comic_id: null };
  const items = buildLibraryItems([transferred], {}, "owned");
  const groups = groupLibraryRows(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].libraryKey, "gcd-370589");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items[0].id, transferred.id);
});

test("unhydrated issues do not collapse into one placeholder series row", () => {
  const collections = [
    { id: "transfer", status: "owned", gcd_issue_id: 370589 },
    { id: "import", status: "owned", gcd_issue_id: 999999 },
  ];
  const groups = groupLibraryRows(buildLibraryItems(collections, {}, "owned"));
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.items[0].id), ["transfer", "import"]);
});
