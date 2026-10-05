import assert from "node:assert/strict";
import test from "node:test";
import { isSeriesSearchVisible, isUsMarketSeries } from "./usMarket.js";

test("US and Canadian GCD publishers are in-market", () => {
  assert.equal(isUsMarketSeries({ publisherCountry: "us", gcdPublisherName: "Art & Soul" }), true);
  assert.equal(isUsMarketSeries({ publisherCountry: "ca", gcdPublisherName: "Aardvark-Vanaheim" }), true);
});

test("the allowlist remains an independent inclusion path", () => {
  assert.equal(isUsMarketSeries({ publisherCountry: "gb", resolvedPublisher: "Marvel Comics" }), true);
});

test("known French-Canadian reprint houses are excluded unless allowlisted", () => {
  assert.equal(isUsMarketSeries({ publisherCountry: "ca", gcdPublisherName: "Les Éditions Héritage" }), false);
  assert.equal(isUsMarketSeries({ publisherCountry: "ca", gcdPublisherName: "Les Editions Heritage" }), false);
});

test("TUG & buster and Cerebus become searchable from corrected publisher rows", () => {
  const tugMarket = isUsMarketSeries({ publisherCountry: "us", gcdPublisherName: "Art & Soul", resolvedPublisher: "Unknown Publisher" });
  const cerebusMarket = isUsMarketSeries({ publisherCountry: "ca", gcdPublisherName: "Aardvark-Vanaheim", resolvedPublisher: "Unknown Publisher" });
  assert.equal(isSeriesSearchVisible({ usMarket: tugMarket, resolvedPublisher: "Unknown Publisher" }), true);
  assert.equal(isSeriesSearchVisible({ usMarket: cerebusMarket, resolvedPublisher: "Unknown Publisher" }), true);
  assert.equal(isSeriesSearchVisible({ usMarket: null, resolvedPublisher: "Unknown Publisher" }), false);
});
