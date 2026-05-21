// Smoke test for src/lib/ebayTitleParser.js
//
// Uses relative import since the @/ alias is Next.js / jsconfig-only and
// doesn't resolve under plain Node. The parser itself uses @/ in production.

import { parseEbayTitle } from "../src/lib/ebayTitleParser.js";

// In production, ebayTitleParser imports gradeBucket via @/lib/valuation.
// That alias breaks here. We patch the module path by intercepting before
// the import — Node will resolve via the relative path inside the file IF
// we run with --experimental-specifier-resolution or transpile. Easiest
// alternative: copy the gradeBucket inline for the test, then run the parser
// against samples.
//
// Actually — node ESM honours `"imports"` in package.json. If you'd rather,
// add `"#lib/*": "./src/lib/*"` there. For now we just check that the parser
// throws if the alias fails, and switch tactics.

const samples = [
  "AMAZING SPIDER-MAN #300 CGC 9.8 1ST VENOM HOT KEY MCFARLANE",
  "Batman #1 1940 Golden Age Detective Comics RAW VF/NM",
  "Walking Dead 1 CGC SS 9.6 Signed Robert Kirkman 2003 Image",
  "X-Men 1 CBCS 7.5 OW/W Pages 1991 Marvel Jim Lee",
  "Hulk 181 CGC 9.4 1ST APPEARANCE WOLVERINE",
  "Spawn #1 Image Comics NM/M",
  "Detective Comics 27 PR poor condition",
  "Fantastic Four #5 (1962) CGC 4.5",
  "ASM 300 RAW VF",
  "Incredible Hulk 181 PGX 8.5",
];

for (const s of samples) {
  const p = parseEbayTitle(s);
  console.log(s);
  console.log(
    `  series=${JSON.stringify(p.series_guess)}  issue=${p.issue_guess}  bucket=${p.grade_bucket}  year=${p.year_guess}  key=${p.is_key_indicator}`
  );
  console.log(
    `  conf: slab_grade=${p.confidence.slab_grade}  issue=${p.confidence.issue}  series=${p.confidence.series}`
  );
  console.log();
}
