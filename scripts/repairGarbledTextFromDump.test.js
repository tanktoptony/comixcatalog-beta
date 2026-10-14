import test from "node:test";
import assert from "node:assert/strict";
import { REPLACEMENT, asciiSkeleton, buildNameIndex, chooseRepair } from "./repairGarbledTextFromDump.js";

const garbled = (text) => text.replace(/[^\x20-\x7e]/g, REPLACEMENT);

test("restores accents when only the accented characters were lost", () => {
  const clean = "Avengers : qu" + String.fromCharCode(0xea) + "te c" + String.fromCharCode(0xe9) + "leste";
  assert.deepEqual(chooseRepair(garbled(clean), clean), { value: clean, reason: "fix" });
});

test("skips when the dump title differs beyond the lost characters", () => {
  const clean = "Batman: El Pr" + String.fromCharCode(0xed) + "ncipe Oscuro";
  assert.equal(chooseRepair(garbled(clean), "Batman: The Dark Prince").reason, "text_differs");
});

test("skips missing or still-garbled dump values", () => {
  assert.equal(chooseRepair(`Caf${REPLACEMENT}`, null).reason, "not_in_dump");
  assert.equal(chooseRepair(`Caf${REPLACEMENT}`, `Caf${REPLACEMENT}`).reason, "dump_also_garbled");
});

test("ascii skeleton drops every non-ASCII character", () => {
  assert.equal(asciiSkeleton(`R${REPLACEMENT}dt!`), "Rdt!");
});

test("accepts GCD's current name only for columns that mirror GCD by id", () => {
  const renamed = "Pelle Svansl" + String.fromCharCode(0xf6) + "s [julalbum]";
  assert.equal(chooseRepair(`Pelle Svansl${REPLACEMENT}s`, renamed, { acceptRenames: true }).reason, "renamed_in_gcd");
  assert.equal(chooseRepair(`Pelle Svansl${REPLACEMENT}s`, renamed).value, null);
});

test("name index only answers unambiguous skeleton matches", () => {
  const e = String.fromCharCode(0xe9), a = String.fromCharCode(0xe0);
  const lookup = buildNameIndex([`Pia Societ${a} San Paolo`, `Caf${e}`, `Caf${a}`, "Plain ASCII"]);
  assert.equal(lookup(`Pia Societ${REPLACEMENT} San Paolo`), `Pia Societ${a} San Paolo`);
  assert.equal(lookup(`Caf${REPLACEMENT}`), null);
});
