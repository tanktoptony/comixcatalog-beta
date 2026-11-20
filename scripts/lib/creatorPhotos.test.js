import assert from "node:assert/strict";
import test from "node:test";
import { cleanCredit, commonsTitle, isFreeLicense, parseSparqlRows, pickImagesByGcdId } from "./creatorPhotos.js";

test("parses complete SPARQL bindings", () => {
  assert.deepEqual(parseSparqlRows([{ gcd: { value: " 42 " }, item: { value: "Q1" }, image: { value: "photo" } }, { gcd: {}, item: {}, image: {} }]), [
    { gcdId: "42", item: "Q1", image: "photo" },
  ]);
});

test("keeps an item's first image and skips ids assigned to several items", () => {
  const picked = pickImagesByGcdId([
    { gcdId: "1", item: "Q1", image: "first" }, { gcdId: "1", item: "Q1", image: "second" },
    { gcdId: "2", item: "Q2", image: "a" }, { gcdId: "2", item: "Q3", image: "b" },
  ]);
  assert.deepEqual([...picked], [["1", "first"]]);
});

test("accepts only the requested free license families", () => {
  for (const license of ["Public domain", "CC0", "CC BY 4.0", "CC BY-SA 3.0 Unported"]) assert.equal(isFreeLicense(license), true);
  for (const license of ["CC BY-NC 4.0", "GFDL", "Copyrighted free use", ""]) assert.equal(isFreeLicense(license), false);
});

test("cleans HTML credit and supplies a fallback", () => {
  assert.equal(cleanCredit('<a href="#">Jane Doe</a>  /  <span>Studio</span>'), "Jane Doe / Studio");
  assert.equal(cleanCredit(" <br> "), "Unknown author");
});

test("turns a Wikidata image URL into a Commons file title", () => {
  assert.equal(commonsTitle("http://commons.wikimedia.org/wiki/Special:FilePath/Jane_Doe%20portrait.jpg"), "File:Jane Doe portrait.jpg");
});
