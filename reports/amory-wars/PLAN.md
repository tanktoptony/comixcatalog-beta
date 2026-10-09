# The Amory Wars catalog repair plan

Source: `snapshot-2026-10-08.json`. ComicVine is used only for covers. GCD remains the publication-metadata authority.

No migration is needed. Formats come from GCD's API via `node scripts/syncGcdSeriesFormat.js --gcd-ids=...` after the repair, not from this plan.

**Correction after checking GCD's live API (2026-10-08):** GCD 56561 is *not* a duplicate. It is the three In Keeping Secrets trade paperbacks (collected edition, trade paperback, issues 1-3). It was pinned to ComicVine 33409 (the single issues), which put the 12 single-issue covers on the TPB series and left the real 12-issue run (49190) blank. The script now moves those covers to 49190, clears 56561's pin, and keeps 56561 visible. Also from the API: 220455 Raiders of Silent Earth is a one-shot, 113303 Good Apollo was an ongoing series, 123461 is a 2018 hardcover ($39.99), and GCD has a 2025 *Complete Collection* TPB (227970) that is not in our gcd_series mirror yet. ComicVine 101245 (2012 Ultimate Edition HC) has no GCD record.

## Canonical publications

Issue counts are distinct published issue/book numbers, not raw GCD rows (which include variants and printings).

| Canonical title | Publisher | Years | Issues/books | Owning GCD series | ComicVine cover volume | Format |
|---|---|---:|---:|---:|---:|---|
| Amory Wars | Image Comics | 2007–2008 | 5 | 26099 | 18858 | Single issues |
| Amory Wars II | Image Comics | 2008 | 5 | 52493 | 32728 | Single issues |
| The Bag On Line Adventures: The Second Stage Turbine Blade | Evil Ink Comics | 2004–2005 | 2 | 144356 | 24728 | Single issues |
| Good Apollo, I'm Burning Star IV | Evil Ink Comics | 2005 | 1 | 144355 | 41701 | Collected edition / graphic novel |
| The Amory Wars: The Second Stage Turbine Blade Ultimate Edition | BOOM! Studios | 2010 | 1 | 51788 | 101236 | Collected edition |
| The Amory Wars in Keeping Secrets of Silent Earth: 3 | BOOM! Studios | 2010–2011 | 12 | 49190 | 33409 | Single issues |
| The Amory Wars: Good Apollo. I'm a Burning Star IV | BOOM! Studios | 2017–2018 | 12 | 113303 | 100558 | Single issues |
| The Amory Wars III: Good Apollo I'm Burning Star IV | BOOM! Studios | 2017–2018 | 3 | 118620 | 106107 | Collected editions |
| The Amory Wars In Keeping Secrets of Silent Earth 3 | BOOM! Studios | 2018 | 1 | 123461 | none found | Collected edition |
| The Amory Wars, Raiders of Silent Earth: 3 | Evil Ink Comics | 2023 | 1 | 220455 | none found | Collected edition |
| The Amory Wars: Good Apollo, I'm a Burning Star IV, Volume II - No World for Tomorrow | BOOM! Studios | 2024–2025 | 12 | 211950 | 158085 | Single issues |
| The Amory Wars: Good Apollo, I'm a Burning Star IV, Volume II - No World for Tomorrow | BOOM! Studios | 2024–present | 2 in GCD | 219105 | 169675 | Collected editions |
| The Amory Wars Sketchbook | 12-Gauge Comics | 2006 | 1 | none in snapshot | 64141 | Sketchbook / ancillary one-shot |
| The Amory Wars: In Keeping Secrets of Silent Earth: 3: Ultimate Edition | BOOM! Studios | 2012 | 1 | none in snapshot | 101245 | Collected edition |

ComicVine 169675 contains three books while the snapshot has two GCD records. Its exact title, 2024 start year, publisher, collected-edition numbering, and the three already-ingested covers make it a confident match; GCD is simply behind by one book. The script does not manufacture a third GCD issue.

The final two publications are evidenced by exact-name ComicVine records but have no GCD series in the supplied snapshot. They cannot safely be created from ComicVine because ComicVine is cover-only in this catalog. They remain documented import gaps rather than fabricated GCD rows.


## Existing app-facing series rows

| Existing row | GCD | Action | Reason |
|---|---:|---|---|
| The Amory Wars: Good Apollo…No World for Tomorrow (`f11b…`) | NULL | Merge into GCD 211950, then delete | Empty hand-made duplicate. |
| Amory Wars (`f5b0…`) | 26099 | Keep | Canonical Image five-issue run; pin 18858. |
| The Amory Wars, Raiders of Silent Earth: 3 (`ddce…`) | 220455 | Keep; mark collected | A one-book Evil Ink publication, not the 2010 run. |
| The Amory Wars Vol. 2 (`72ed…`) | NULL | Merge into GCD 52493, then delete | Hand-made row; its five comics exactly map to GCD 52493. |
| The Amory Wars Vol. 1 (`dbe4…`) | NULL | Merge into GCD 26099, then delete | Hand-made row; its five comics exactly map to GCD 26099. |
| No World For Tomorrow (`9a68…`) | NULL | Merge into GCD 211950, then delete | Hand-made row containing eleven of the twelve local comics. |
| No World For Tomorrow (`73b6…`) | NULL | Merge into GCD 211950, then delete | Hand-made publisher-spelling duplicate containing issue 2. |
| Good Apollo (`d42c…`) | NULL | Merge into GCD 113303, then delete | Empty hand-made duplicate of the 2017 single-issue run. |
| Amory Wars II (`66b2…`) | 52493 | Keep | Canonical Image five-issue run; pin 32728. |
| Second Stage Turbine Blade Ultimate Edition (`400b…`) | 51788 | Keep; mark collected | Real one-book BOOM! edition; pin 101236. |
| In Keeping Secrets (`6328…`) | 49190 | Keep | Complete twelve-issue GCD owner; receives volume 33409 and its covers. |
| No World for Tomorrow (`aae1…`) | 211950 | Keep | Canonical twelve-issue run; pin 158085. |
| No World for Tomorrow (`03c4…`) | 219105 | Keep; mark collected | Separate collected-edition series; pin 169675. |
| Amory Wars III: Good Apollo (`09d4…`) | 118620 | Keep; mark collected | Three collected books, distinct from the twelve singles. |
| In Keeping Secrets (`45db…`) | 56561 | Keep; unpin 33409 | The three trade paperbacks. Its 12 covers belong to the single issues (49190). |
| In Keeping Secrets (`a208…`) | 123461 | Keep; mark collected | Separate 2018 one-book edition; no confident ComicVine volume. |
| Good Apollo (`4039…`) | 113303 | Keep | Canonical twelve-issue run; pin 100558. |
| The Second Stage Turbine Blade (`acf1…`) | NULL | Merge into GCD 144356, then delete | Hand-made row; its collected comic maps to GCD issue 1952432. |
| The Bag On Line Adventures (`aa36…`) | 144356 | Keep | Real original two-issue Evil Ink publication; pin 24728. |
| Good Apollo, I'm Burning Star IV (`db5b…`) | 144355 | Keep; mark collected | Real 2005 graphic novel; pin 41701. |
| Kill Audio (`88e5…`) | 42759 | No change | Claudio Sanchez work, but not an Amory Wars publication. |
| Kill Audio (`3b90…`) | 53834 | No change | Collected Kill Audio record; outside this franchise repair. |
| Key of Z (`14fb…`) | 216697 | No change | Claudio Sanchez work, but not an Amory Wars publication. |
| Key of Z (`6317…`) | 61716 | No change | Claudio Sanchez work, but not an Amory Wars publication. |

The seven manual rows are deleted only after their comics have been repointed and a fresh reference check returns zero. No `comics` or `user_collections` row is deleted; the 13 collection entries continue to point to the same comic UUIDs.

## Cover gaps in the snapshot

“Missing” here means no `canonical_covers` row has that exact GCD issue id in the snapshot.

| GCD series | Missing GCD issues | Resolution |
|---:|---|---|
| 26099 | none | Already complete. |
| 52493 | none | Already complete. |
| 49190 | #1–12: 758919, 763339, 770957, 773583, 782735, 791156, 794354, 806096, 815759, 824348, 839725, 851455 | Volume 33409 already has all twelve covers under duplicate 56561; relink them and fill exact issue ids. |
| 144356 | #1 1952431; #2 1952432 | Ingest volume 24728. |
| 144355 | #1 1952401 | Ingest volume 41701. |
| 51788 | `[nn]` 771546 | Ingest volume 101236. |
| 113303 | #1–12: 1689521, 1697816, 1713222, 1720073, 1732658, 1732659, 1741268, 1746798, 1762653, 1779079, 1962618, 1962619 | Volume 100558 is already present; attribute its twelve covers and fill exact issue ids. |
| 118620 | #1 1759124; #2 1800088; #3 2482046 | Ingest volume 106107. |
| 123461 | `[nn]` 1798418 | No confident volume; leave as a search target. |
| 220455 | `[nn]` 2706483 | No confident volume; leave as a search target. |
| 211950 | #1–12: 2629082, 2636695, 2645263, 2651769, 2656557, 2665726, 2680884, 2686674, 2717405, 2728327, 2744226, 2749653 | Volume 158085 is already present; attribute its twelve covers and fill exact issue ids. |
| 219105 | #1 2689911; #2 2752188 | Volume 169675 is already present; attribute covers #1–2. Cover #3 remains unlinked until GCD has the corresponding book. |

`cover-targets.json` contains only publications that still require ingestion after the attribution repair. Its objects match `gap-manual.json` (`name`, `publisher`, `year`, and optional confirmed `volume_id`).

## Needs a human call

- GCD’s title “The Amory Wars, Raiders of Silent Earth: 3” may be a bad catalog title, but the snapshot has no source field that proves a replacement. The script preserves it rather than inventing one.
- GCD 123461 has no format metadata and no confident ComicVine result. Its one unnumbered issue strongly indicates a collected edition, so it is marked accordingly; binding and edition subtitle remain unknown.
- ComicVine volume 169675 has a third collected book not represented in the GCD snapshot. It should be imported through the normal GCD metadata path when available, not synthesized by this repair.
- The 2006 Sketchbook (ComicVine 64141) and 2012 *In Keeping Secrets* Ultimate Edition (ComicVine 101245) need their GCD records located or imported before app-facing rows or cover targets can be added. The snapshot supplies no safe owning GCD id.

## Apply behavior

`node scripts/fixAmoryWars.js` prints the complete change set. `node scripts/fixAmoryWars.js --apply` repoints local comics, sets exact GCD issue ids, applies format flags and safe ComicVine pins, reattributes already-ingested covers, hides GCD 56561, and deletes only the now-unreferenced manual rows. Before any pin, it refuses the entire run if that volume is held by a non-Amory series row.
