# Catalog check: Ep 008 (Nice House) and Ep 009 (IKSSE:3), November 17, 2026

## Fixed (covers, standing approval)

1. The Nice House on the Lake #1 FCBD 2026 Special Edition (GCD series 236199): the search card had no cover. Ingested the ComicVine cover (CV volume 177092) and linked it to GCD issue 2829293. Live on search and the issue page.
2. The Amory Wars: The Second Stage Turbine Blade Ultimate Edition (2010, GCD 51788): the search card had no cover. The cover row existed but was never linked to its GCD issue; linked it to issue 771546. Live on search.

Both had the same cause: GCD numbers one-shots "[nn]" while ComicVine says "1", so the ingester only matches the series ("series-only") and the card resolver finds no issue cover.

## Not fixed (write-up only)

1. The Nice House by the Sea search card says "2024 to 2025, 6 issues". The series page is right (12 issues, 2024 to 2026). The search row's cached count and end year are stale (series.issue_count_cached / year_end_cached). Fix: refresh the search cache for GCD 213826. Until then, don't use the search card for Sea on screen.
2. The Nice House by the Sea page says "Written most by James Tynion IV and Steve Orlando, drawn most by Álvaro Martínez Bueno and Serg Acuña." Orlando and Acuña are credited on one story in #4 (October 2024, the first Vertigo issue), most likely a preview of another Vertigo book. Fix idea: only name a second writer or artist when they cover a real share of the issues.
3. 43,216 cover rows are "series-only" with no issue link. Many will be the "[nn]" one-shot case above. A safe rule: when a series has exactly one GCD issue and exactly one cover row, link them. Open question for Tony below.
4. IKSSE:3 collected editions have no covers: the three trades (GCD 56561), the 2018 hardcover (GCD 123461), the 2025 Complete Collection, and the 2023 Raiders of Silent Earth: 3 one-shot (GCD 220455). ComicVine has none of them, so there's nothing to ingest. A phone photo of any Tony owns would fix them.
5. Small date gaps: IKSSE:3 #1 and #6 have no cover date and #2 shows only "2010". The Lake series header says "2021 to 2023" (cover dates); it was on sale June 2021 to December 2022, so the script should say 2021 to 2022.

## Checked and fine

- The Nice House on the Lake (2021): 12 of 12 issues, DC Comics, every cover real and matched to its ComicVine issue. Trades and Deluxe grouped as editions.
- The Nice House by the Sea (2024): 12 of 12 issues, DC Comics, every cover real and matched.
- The Amory Wars: In Keeping Secrets of Silent Earth: 3 (BOOM!, 2010): 12 of 12 issues, every cover real and matched.
