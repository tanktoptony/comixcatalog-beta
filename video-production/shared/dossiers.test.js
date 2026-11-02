import test from "node:test";
import assert from "node:assert/strict";
import { DOSSIERS } from "./dossiers.js";

const validPower = (value) => Number.isInteger(value) && value >= 1 && value <= 7;

test("registered dossiers contain valid baseline and overlay values", () => {
  for (const [id, dossier] of Object.entries(DOSSIERS)) {
    assert.equal(dossier.stats.length, 6, `${id} must have six stats`);
    for (const stat of dossier.stats) assert.ok(validPower(stat.value), `${id}.${stat.key} must be 1 to 7`);
    assert.ok(dossier.sorcery.value === null || validPower(dossier.sorcery.value), `${id}.sorcery must be null or 1 to 7`);
    for (const [overlayKey, overlay] of Object.entries(dossier.overlays ?? {})) {
      for (const stat of dossier.stats) {
        const value = overlay.values[stat.key];
        assert.ok(validPower(value), `${id}.${overlayKey}.${stat.key} must be 1 to 7`);
        assert.ok(value >= stat.value, `${id}.${overlayKey}.${stat.key} must not reduce the baseline`);
      }
    }
  }
});

test("dossier copy contains no dash punctuation", () => {
  const walk = (value, path = "DOSSIERS") => {
    if (typeof value === "string") assert.doesNotMatch(value, /[\u2013\u2014]/, `${path} contains a forbidden dash`);
    else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, `${path}.${key}`));
  };
  walk(DOSSIERS);
});
