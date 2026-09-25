// Cases taken from needs_volume_id.json, not invented.
//
// A wrong pin is the expensive failure: comicvine_api_to_supabase.py trusts
// a pinned volume_id ahead of its own title matching, so a bad one routes an
// entire run's covers to the wrong series and keeps doing it. Most of these
// tests therefore assert a REFUSAL.

import test from "node:test";
import assert from "node:assert/strict";
import { resolveByYear } from "./resolveByYear.js";
import { looksCollectedTitle } from "./collectedTitle.js";
import { publisherCompatible } from "./publisherCompat.js";

const cand = (id, name, start_year, publisher = "Marvel Comics") => ({ id, name, publisher, start_year });

test("one candidate on our exact year wins", () => {
  const r = resolveByYear({
    name: "Wolverine", publisher: "Marvel Comics", year: 1988,
    candidates: [cand(1, "Wolverine", 1988), cand(2, "Wolverine", 2003), cand(3, "Wolverine", 2010)],
  });
  assert.equal(r.status, "matched");
  assert.equal(r.candidate.id, 1);
  assert.equal(r.basis, "exact-year");
});

test("two candidates on the same year refuse rather than pick the first", () => {
  const r = resolveByYear({
    name: "X-Men", publisher: "Marvel Comics", year: 1991,
    candidates: [cand(1, "X-Men", 1991), cand(2, "X-Men", 1991), cand(3, "X-Men", 2004)],
  });
  assert.equal(r.status, "ambiguous");
  assert.equal(r.reason, "multiple_same_year");
});

test("no candidate on our year refuses, because a match would be a guess", () => {
  const r = resolveByYear({
    name: "Spider-Man", publisher: "Marvel Comics", year: 1997,
    candidates: [cand(1, "Spider-Man", 2016), cand(2, "Spider-Man", 2022)],
  });
  assert.equal(r.status, "ambiguous");
  assert.equal(r.reason, "no_year_match");
});

test("a trade collection is never pinned, even on an exact year", () => {
  // The recorded failure mode in this repo: a "successful" match that was a
  // trade collection rather than the monthly it reprints.
  const r = resolveByYear({
    name: "Captain Marvel", publisher: "Marvel Comics", year: 2019,
    candidates: [cand(1, "Captain Marvel by Kelly Thompson", 2019), cand(2, "Captain Marvel", 2023)],
  });
  assert.equal(r.status, "ambiguous");
  assert.equal(r.reason, "no_year_match", "the trade was removed before counting");
});

test("a trade is dropped so the real volume can still win", () => {
  const r = resolveByYear({
    name: "Daredevil", publisher: "Marvel Comics", year: 1998,
    candidates: [cand(1, "Daredevil Omnibus", 1998), cand(2, "Daredevil", 1998), cand(3, "Daredevil", 2011)],
  });
  assert.equal(r.status, "matched");
  assert.equal(r.candidate.id, 2, "the monthly, not the omnibus");
});

test("when every candidate looks collected, refuse", () => {
  const r = resolveByYear({
    name: "Thor", publisher: "Marvel Comics", year: 2020,
    candidates: [cand(1, "Thor Vol. 1", 2020), cand(2, "Thor by Donny Cates", 2020)],
  });
  assert.equal(r.status, "ambiguous");
  assert.equal(r.reason, "all_candidates_look_collected");
});

test("a year either side lands only when the title matches exactly", () => {
  const ok = resolveByYear({
    name: "Ms. Marvel", publisher: "Marvel Comics", year: 2006,
    candidates: [cand(1, "Ms. Marvel", 2005), cand(2, "Ms. Marvel Special", 2014)],
  });
  assert.equal(ok.status, "matched");
  assert.equal(ok.basis, "near-year");

  const no = resolveByYear({
    name: "Ms. Marvel", publisher: "Marvel Comics", year: 2006,
    candidates: [cand(1, "Ms. Marvel Annual", 2005), cand(2, "Ms. Marvel Special", 2014)],
  });
  assert.equal(no.status, "ambiguous", "a looser year needs a tighter title");
});

test("a blank or junk year never matches a candidate with no year", () => {
  // Number("") and Number(null) are both 0. Without a guard, "no year" would
  // match every candidate whose start_year is also missing.
  for (const y of ["", null, undefined, 0, "n/a"]) {
    const r = resolveByYear({
      name: "Barbie", publisher: "Marvel Comics", year: y,
      candidates: [cand(1, "Barbie", null), cand(2, "Barbie", 1991)],
    });
    assert.equal(r.status, "ambiguous", `year ${JSON.stringify(y)} must not resolve`);
    assert.equal(r.reason, "no_year_on_our_side");
  }
});

test("a candidate with no start year is not treated as year zero", () => {
  const r = resolveByYear({
    name: "Storm", publisher: "Marvel Comics", year: 2006,
    candidates: [cand(1, "Storm", null), cand(2, "Storm", 2006)],
  });
  assert.equal(r.status, "matched");
  assert.equal(r.candidate.id, 2);
});

test("a single candidate is left to the existing path, not double-handled", () => {
  const r = resolveByYear({ name: "Rai", publisher: "Marvel Comics", year: 1992, candidates: [cand(1, "Rai", 1992)] });
  assert.equal(r.status, "ambiguous");
  assert.equal(r.reason, "single_candidate_handled_elsewhere");
});

test("no candidates at all is reported as such", () => {
  assert.equal(resolveByYear({ name: "X", publisher: "Marvel Comics", year: 2000, candidates: [] }).reason, "no_candidates");
  assert.equal(resolveByYear({ name: "X", publisher: "Marvel Comics", year: 2000 }).reason, "no_candidates");
});

test("the collected-title detector catches the shapes ComicVine actually uses", () => {
  for (const t of ["Captain Marvel by Kelly Thompson", "Daredevil Omnibus", "X-Men Vol. 3",
                   "Saga Vol 2", "Hulk Epic Collection", "Marvel Masterworks", "Batman TPB",
                   "The Complete Maus", "Spider-Man Collection", "DC Library"]) {
    assert.ok(looksCollectedTitle(t), `should flag: ${t}`);
  }
  for (const t of ["Wolverine", "The Amazing Spider-Man", "Rai and the Future Force",
                   "Captain America", "Bybee Street"]) {
    assert.ok(!looksCollectedTitle(t), `should NOT flag: ${t}`);
  }
});

test("a foreign edition is refused even when the year matches exactly", () => {
  // From the real dry run: these four were about to be pinned before the
  // publisher guard existed. All are foreign editions of the US book.
  const cases = [
    { name: "Cinema Purgatorio", publisher: "Avatar Press", year: 2016,
      candidates: [cand(1, "Cinema Purgatorio", 2017, "Panini España"), cand(2, "Cinema Purgatorio", 2099, "Avatar Press")] },
    { name: "Space-Mullet!", publisher: "Dark Horse Comics", year: 2016,
      candidates: [cand(1, "Space-Mullet!", 2016, "Akileos"), cand(2, "Space-Mullet!", 2020, "Other")] },
    { name: "Girl", publisher: "Dynamite Entertainment", year: 2010,
      candidates: [cand(1, "Girl", 2010, "Dynamite (France)"), cand(2, "Girl", 2015, "Other")] },
    { name: "Amazing Spider-Man", publisher: "Marvel Comics", year: 2014,
      candidates: [cand(1, "Amazing Spider-Man", 2014, "Panini Comics"), cand(2, "Amazing Spider-Man", 2099, "Other")] },
  ];
  for (const c of cases) {
    const r = resolveByYear(c);
    // What matters is that it refuses. Which guard caught it depends on
    // whether a compatible-but-wrong-year candidate also survived, so
    // asserting the exact reason here would be asserting the fixture.
    assert.equal(r.status, "ambiguous", `${c.name} must not pin a foreign edition`);
    assert.notEqual(r.reason, undefined);
  }
});

test("a known imprint alias still resolves, because it is the same publisher", () => {
  // Gold Key was Western Publishing's own imprint, and the Python source
  // already lists the pair. These are the stale backlog entries the alias
  // now covers.
  const r = resolveByYear({
    name: "Tom and Jerry", publisher: "Gold Key", year: 1962,
    candidates: [cand(1, "Tom and Jerry", 1962, "Western Publishing"), cand(2, "Tom and Jerry", 1949, "Dell")],
  });
  assert.equal(r.status, "matched");
  assert.equal(r.candidate.id, 1);
});

test("publisher compatibility is exact-set, never a prefix", () => {
  // The trap the Python source calls out by name.
  assert.ok(publisherCompatible("Marvel Comics", "Marvel"));
  assert.ok(!publisherCompatible("Marvel Comics", "Marvel UK/Panini UK"));
  assert.ok(publisherCompatible("Gold Key", "Western Publishing"));
  assert.ok(publisherCompatible("Valiant Comics", "Valiant"));
  assert.ok(!publisherCompatible("Dynamite Entertainment", "Dynamite (France)"));
  assert.ok(!publisherCompatible("Avatar Press", "Panini España"));
  assert.ok(!publisherCompatible("", "Marvel"));
});
