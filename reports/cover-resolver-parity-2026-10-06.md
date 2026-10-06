# Cover resolver parity — 2026-10-06

Sample: 5470; top series: 2000; title clusters: 1500; random: 1970; seed: 41; break tier 2: no

## Review (2026-10-06)

Old = what production's `/api/issues/[id]` returns today. New = `resolveCovers`. Same seeded sample throughout (saved, so reruns compare like with like).

- **Gained 392:** issues with no cover today that get one. 302 via tier 1 (exact issue link), 90 via tier 2 (series + issue number). Spot-checked every 20th row: all the right issue and volume. Most are The Beano and The Beezer, whose cover counts passed the old pages' 1,000-row read.
- **Lost 19, none in any user's library:**
  - Carnage (13): the old pages put one cover on several different Carnage issue records (one #1 cover on 4 records; the 2022 and 2023 #1s sharing one). Cross-volume bleed, refused on purpose.
  - From Hell ×2, Grimm, New Warriors (2014) #1, Super DC Giant S-21, Wynd #1: matched only by title to covers tagged to a different series record. Fixable by pinning when they matter.
- **Changed 1:** Justice League (2018) #37 (gcd 1776091) would take a 2011-volume cover through one wrong `gcd_issue_id` link that passes the year check. Data fix in WS4b (relink tooling). Not owned.
- **Fixed during review:** The Transformers Universe (8 records, 3 owned books) was lost because its covers sat under duplicate series 199403 and series 11216 was pinned to the wrong ComicVine volume. Tony ran the data fix 2026-10-06; all 8 now resolve to the right covers. Before the tier-1 year check was added, 10 covers changed, all tier-1 links from mis-pinned volumes (Transformers Universe, Teen Titans, Wildcats, X-Files).
- **Can this check fail?** With tier 2 disabled (`--break-tier=2`), the same sample reports **1,264 lost** instead of 19.

| Same | Gained | Lost | Changed |
|---:|---:|---:|---:|
| 5058 | 392 | 19 | 1 |

| Result | Series | Year | Issue | GCD ID | Old path | New path | Tier |
|---|---|---:|---|---:|---|---|---:|
| gained | The Beano |  | 1177 | 161668 |  | comicvine/the-beano/vol-26847/741200-issue-1177.jpg | 1 |
| gained | Detective Comics | 2010 | 868 | 2124995 |  | comicvine/detective-comics/vol-18058/231610-batman-impostors-part-two-the-s-laughter-of-fools.jpg | 2 |
| gained | Batman | 2004 | 632 | 224151 |  | comicvine/batman/vol-796/100887-orpheus-in-the-underworld.jpg | 1 |
| gained | The Beano |  | 3480 | 740165 |  | comicvine/the-beano/vol-26847/223100-issue-3480.jpg | 1 |
| gained | Spawn |  | 317 | 2267662 |  | comicvine/spawn/vol-4937/846035-chain-gang-part-four.jpg | 2 |
| gained | The Beano |  | 2864 | 163355 |  | comicvine/the-beano/vol-26847/758988-issue-2864.jpg | 1 |
| gained | Detective Comics | 2005 | 802 | 2236973 |  | comicvine/detective-comics/vol-18058/113386-city-of-crime-part-2-the-secret-keepers-when-you-re-strange-part-2.jpg | 2 |
| gained | Action Comics | 1994 | 700 | 1965004 |  | comicvine/action-comics/vol-18005/111014-swan-song.jpg | 2 |
| gained | Detective Comics | 1983 | 522 | 37072 |  | comicvine/detective-comics/vol-18058/112935-snow-blind-automatic-pirate.jpg | 1 |
| gained | The Beano |  | 1422 | 161913 |  | comicvine/the-beano/vol-26847/161732-issue-1422.jpg | 1 |
| gained | Action Comics | 1981 | 519 | 2107520 |  | comicvine/action-comics/vol-18005/120907-where-the-space-winds-blows-family-plot.jpg | 2 |
| gained | Detective Comics | 1984 | 541 | 1705061 |  | comicvine/detective-comics/vol-18058/112996-c-c-cold-the-nightfly.jpg | 2 |
| gained | The Beezer |  | 277 | 584242 |  | comicvine/the-beezer/vol-27927/945235-issue-277.jpg | 1 |
| gained | Spawn | 2023 | 346 | 2617144 |  | comicvine/spawn/vol-4937/1027130-issue-346.jpg | 2 |
| gained | The Beano |  | 3286 | 596829 |  | comicvine/the-beano/vol-26847/768606-issue-3286.jpg | 1 |
| gained | Action Comics | 2005 | 826 | 224128 |  | comicvine/action-comics/vol-18005/112410-lightning-strikes-twice.jpg | 1 |
| gained | Detective Comics | 1983 | 530 | 1119864 |  | comicvine/detective-comics/vol-18058/112944-passion-nocturnale-survival-of-the-fittest.jpg | 2 |
| gained | The Beezer |  | 624 | 584589 |  | comicvine/the-beezer/vol-27927/281177-issue-624.jpg | 1 |
| gained | The Beano | 2000 | 2998 | 163489 |  | comicvine/the-beano/vol-26847/277890-issue-2998.jpg | 1 |
| gained | Action Comics | 1991 | 661 | 1564945 |  | comicvine/action-comics/vol-18005/118038-stretching-a-point.jpg | 2 |
| gained | Detective Comics | 2007 | 832 | 311413 |  | comicvine/detective-comics/vol-18058/108964-triage.jpg | 1 |
| gained | The Beano |  | 4140 | 2414431 |  | comicvine/the-beano/vol-26847/1049704-issue-4140.jpg | 1 |
| gained | Action Comics | 1994 | 704 | 55950 |  | comicvine/action-comics/vol-18005/115670-eradication-day.jpg | 1 |
| gained | Detective Comics | 2002 | 772 | 2016110 |  | comicvine/detective-comics/vol-18058/113324-bruce-wayne-fugitive-part-16-principle-lost-voices-part-10.jpg | 2 |
| gained | The Beezer |  | 263 | 584228 |  | comicvine/the-beezer/vol-27927/945232-issue-263.jpg | 1 |
| gained | The Beano |  | 3195 | 163686 |  | comicvine/the-beano/vol-26847/565813-issue-3195.jpg | 1 |
| gained | Action Comics | 1982 | 534 | 36552 |  | comicvine/action-comics/vol-18005/120766-two-for-the-death-of-one-air-wave-s-close-encounter.jpg | 1 |
| gained | Batman | 2005 | 637 | 224156 |  | comicvine/batman/vol-796/100892-under-the-hood-part-3-overnight-deliveries.jpeg | 1 |
| gained | The Beezer |  | 1034 | 584999 |  | comicvine/the-beezer/vol-27927/392472-issue-1034.jpg | 1 |
| gained | The Beano |  | 3663 | 1180455 |  | comicvine/the-beano/vol-26847/371974-issue-3663.jpg | 1 |
| gained | Action Comics | 2010 | 886 | 2047887 |  | comicvine/action-comics/vol-18005/196735-divine-spark-part-four.jpg | 2 |
| gained | Detective Comics | 1990 | 621 | 893995 |  | comicvine/detective-comics/vol-18058/113081-rite-of-passage-part-4-trial-by-fire-make-me-a-hero.jpg | 2 |
| gained | Spawn | 2024 | 349 | 2603480 |  | comicvine/spawn/vol-4937/1042321-issue-349.jpg | 1 |
| gained | Action Comics | 1983 | 548 | 1124127 |  | comicvine/action-comics/vol-18005/120255-escape-from-the-phantom-zone.jpg | 2 |
| gained | Detective Comics | 1984 | 537 | 1977115 |  | comicvine/detective-comics/vol-18058/112993-down-below-strike-first.jpg | 2 |
| gained | The Beano |  | 985 | 161476 |  | comicvine/the-beano/vol-26847/256137-issue-985.jpg | 1 |
| gained | The Beezer |  | 1073 | 585038 |  | comicvine/the-beezer/vol-27927/392479-issue-1073.jpg | 1 |
| gained | The Beano |  | 1393 | 161884 |  | comicvine/the-beano/vol-26847/753468-issue-1393.jpg | 1 |
| gained | Action Comics | 2006 | 841 | 2034600 |  | comicvine/action-comics/vol-18005/112002-back-in-action-part-1.jpg | 2 |
| gained | Detective Comics | 1989 | 599 | 46142 |  | comicvine/detective-comics/vol-18058/106872-blind-justice-part-2-of-3.jpg | 1 |
| gained | Batman | 2003 | 619 | 913783 |  | comicvine/batman/vol-796/91388-hush-chapter-twelve-the-end.png | 2 |
| gained | Action Comics | 1983 | 545 | 1098511 |  | comicvine/action-comics/vol-18005/116890-with-but-a-single-step.jpg | 2 |
| gained | Detective Comics | 1994 | 679 | 56041 |  | comicvine/detective-comics/vol-18058/113132-prodigal-three-the-vermin-factor.jpg | 1 |
| gained | Archie | 2014 | 659 | 1253198 |  | comicvine/archie/vol-9628/465899-walk-on-the-wild-side.jpg | 2 |
| gained | Detective Comics | 1994 | 675 | 894000 |  | comicvine/detective-comics/vol-18058/108528-midnight-duel.jpg | 2 |
| gained | Action Comics | 1983 | 542 | 1634709 |  | comicvine/action-comics/vol-18005/120628-savage-awakening.jpg | 2 |
| gained | Detective Comics | 1992 | 648 | 1953509 |  | comicvine/detective-comics/vol-18058/113119-let-the-puzzlement-fit-the-crime.jpg | 2 |
| gained | Archie | 2011 | 626 | 888655 |  | comicvine/archie/vol-9628/300052-the-sack-rifice.jpg | 2 |
| gained | The Beano |  | 2665 | 163156 |  | comicvine/the-beano/vol-26847/737495-issue-2665.jpg | 1 |
| gained | Action Comics | 2004 | 809 | 873101 |  | comicvine/action-comics/vol-18005/113360-creeping-death.jpg | 2 |
| gained | Detective Comics | 1994 | 677 | 2078317 |  | comicvine/detective-comics/vol-18058/108530-flesh-and-steel.jpg | 2 |
| gained | The Beezer |  | 1356 | 585321 |  | comicvine/the-beezer/vol-27927/462828-issue-1356.jpg | 1 |
| gained | The Beano |  | 1362 | 161853 |  | comicvine/the-beano/vol-26847/491239-issue-1362.jpg | 1 |
| gained | Action Comics | 1991 | 661 | 49072 |  | comicvine/action-comics/vol-18005/118038-stretching-a-point.jpg | 1 |
| gained | Detective Comics | 1983 | 526 | 1087067 |  | comicvine/detective-comics/vol-18058/112940-all-my-enemies-against-me.jpg | 2 |
| gained | The Beano |  | 1291 | 161782 |  | comicvine/the-beano/vol-26847/769539-issue-1291.jpg | 1 |
| gained | Action Comics | 1989 | 648 | 47066 |  | comicvine/action-comics/vol-18005/118625-body-and-mind.jpg | 1 |
| gained | The Beezer |  | 1478 | 585443 |  | comicvine/the-beezer/vol-27927/843537-issue-1478.jpg | 1 |
| gained | The Beano |  | 1994 | 162485 |  | comicvine/the-beano/vol-26847/460420-issue-1994.jpg | 1 |
| gained | The Beano |  | 1031 | 161522 |  | comicvine/the-beano/vol-26847/278106-issue-1031.jpg | 1 |
| gained | Action Comics | 2004 | 815 | 2023057 |  | comicvine/action-comics/vol-18005/113262-superman-vs-gog-part-1-endtimes.jpg | 2 |
| gained | Batman | 1997 | 541 | 1987726 |  | comicvine/batman/vol-796/43550-the-spectre-of-vengeance-part-2-mask-of-guilt.jpg | 2 |
| gained | Action Comics | 1993 | 686 | 52526 |  | comicvine/action-comics/vol-18005/110957-funeral-for-a-friend-part-6-who-s-buried-in-superman-s-tomb.jpg | 1 |
| gained | The Beano |  | 1739 | 162230 |  | comicvine/the-beano/vol-26847/769637-issue-1739.jpg | 1 |
| gained | Batman | 2011 | 711 | 2022570 |  | comicvine/batman/vol-796/274396-pieces-part-two-the-long-way-back.jpg | 2 |
| gained | The Beano |  | 1227 | 161718 |  | comicvine/the-beano/vol-26847/769500-issue-1227.jpg | 1 |
| gained | Action Comics | 1990 | 655 | 48143 |  | comicvine/action-comics/vol-18005/116267-survival-ma-kent-s-photo-album.jpg | 1 |
| gained | Detective Comics | 1991 | 631 | 1765930 |  | comicvine/detective-comics/vol-18058/113090-the-golem-of-gotham-part-one.jpg | 2 |
| gained | The Beezer |  | 700 | 584665 |  | comicvine/the-beezer/vol-27927/945291-issue-700.jpg | 1 |
| gained | Batman | 2010 | 700 | 853108 |  | comicvine/batman/vol-796/218346-time-and-the-batman.jpg | 2 |
| gained | The Beano |  | 1544 | 162035 |  | comicvine/the-beano/vol-26847/565799-issue-1544.jpg | 1 |
| gained | Detective Comics | 1996 | 695 | 1980953 |  | comicvine/detective-comics/vol-18058/108469-contagion-part-2-the-gray-area.jpg | 2 |
| gained | The Beezer |  | 787 | 584752 |  | comicvine/the-beezer/vol-27927/945356-issue-787.jpg | 1 |
| gained | Batman | 2007 | 666 | 1676991 |  | comicvine/batman/vol-796/111970-batman-in-bethlehem.jpeg | 2 |
| gained | The Beano |  | 3674 | 1180466 |  | comicvine/the-beano/vol-26847/392566-issue-3674.jpg | 1 |
| gained | Detective Comics | 2009 | 856 | 2124993 |  | comicvine/detective-comics/vol-18058/168514-elegy-part-3-affettuoso-pipeline-chapter-1-part-3.jpg | 2 |
| gained | The Beano |  | 2185 | 162676 |  | comicvine/the-beano/vol-26847/752809-issue-2185.jpg | 1 |
| gained | Detective Comics | 1985 | 547 | 1676834 |  | comicvine/detective-comics/vol-18058/113002-cast-of-characters-sequence-of-events-most-likely-to-die.jpg | 2 |
| gained | The Beezer |  | 1164 | 585129 |  | comicvine/the-beezer/vol-27927/839452-issue-1164.jpg | 1 |
| gained | The Beano |  | 1761 | 162252 |  | comicvine/the-beano/vol-26847/770101-issue-1761.jpg | 1 |
| gained | Action Comics | 1992 | 676 | 51083 |  | comicvine/action-comics/vol-18005/116708-man-of-the-hour.jpg | 2 |
| gained | Detective Comics | 2011 | 876 | 824285 |  | comicvine/detective-comics/vol-18058/268975-hungry-city-pt-1-of-3.jpeg | 1 |
| gained | The Beano |  | 4008 | 2036786 |  | comicvine/the-beano/vol-26847/729082-issue-4008.jpg | 1 |
| gained | Action Comics | 1986 | 578 | 1922816 |  | comicvine/action-comics/vol-18005/119639-the-most-popular-man-in-metropolis.jpg | 2 |
| gained | Detective Comics | 1996 | 701 | 1980951 |  | comicvine/detective-comics/vol-18058/113160-gotham-s-scourge.jpg | 2 |
| gained | The Beano |  | 2324 | 162815 |  | comicvine/the-beano/vol-26847/736361-issue-2324.jpg | 1 |
| gained | The Beezer |  | 868 | 584833 |  | comicvine/the-beezer/vol-27927/250427-issue-868.jpg | 1 |
| gained | The Beano |  | 3090 | 163581 |  | comicvine/the-beano/vol-26847/215592-issue-3090.jpg | 1 |
| gained | Action Comics | 1997 | 729 | 92080 |  | comicvine/action-comics/vol-18005/115466-generator-x.jpg | 1 |
| gained | Detective Comics | 1997 | 708 | 60188 |  | comicvine/detective-comics/vol-18058/113178-the-death-lottery-part-one-heart-of-glass.jpg | 1 |
| gained | Batman | 2001 | 591 | 103140 |  | comicvine/batman/vol-796/83259-shot-through-the-heart-part-1.jpg | 1 |
| gained | The Beano | 2016 | 3865 | 1662216 |  | comicvine/the-beano/vol-26847/576067-issue-3865.jpg | 1 |
| gained | Detective Comics | 2007 | 826 | 2034473 |  | comicvine/detective-comics/vol-18058/111257-slayride.jpg | 2 |
| gained | The Beezer |  | 359 | 584324 |  | comicvine/the-beezer/vol-27927/945251-issue-359.jpg | 1 |
| gained | Batman | 2003 | 616 | 2018431 |  | comicvine/batman/vol-796/91385-hush-chapter-nine-the-assasins.png | 2 |
| gained | Archie | 2012 | 636 | 992105 |  | comicvine/archie/vol-9628/352549-the-great-switcheroo.jpg | 2 |
| gained | The Beano |  | 1047 | 161538 |  | comicvine/the-beano/vol-26847/739063-issue-1047.jpg | 1 |
| gained | Detective Comics | 1988 | 590 | 1838171 |  | comicvine/detective-comics/vol-18058/113058-an-american-batman-in-london.jpg | 2 |
| gained | Archie | 2015 | 666 | 1380088 |  | comicvine/archie/vol-9628/490963-issue-666.jpg | 2 |
| gained | The Beano |  | 3942 | 1837617 |  | comicvine/the-beano/vol-26847/688733-issue-3942.jpg | 1 |
| gained | Action Comics | 1985 | 566 | 39831 |  | comicvine/action-comics/vol-18005/119974-traumas-in-the-bahamas-with-love-from-superman.jpg | 1 |
| gained | Detective Comics | 1987 | 572 | 42649 |  | comicvine/detective-comics/vol-18058/113034-fifty-years-anniversary.jpg | 1 |
| gained | The Beezer |  | 532 | 584497 |  | comicvine/the-beezer/vol-27927/827988-issue-532.jpg | 1 |
| gained | Spawn | 2023 | 347 | 2580355 |  | comicvine/spawn/vol-4937/1030189-issue-347.jpg | 1 |
| gained | Action Comics | 2004 | 810 | 873135 |  | comicvine/action-comics/vol-18005/113271-walking-midnight.jpeg | 2 |
| gained | The Beezer |  | 1802 | 585767 |  | comicvine/the-beezer/vol-27927/231238-issue-1802.jpg | 1 |
| gained | Batman | 2002 | 606 | 2201029 |  | comicvine/batman/vol-796/124801-death-wish-for-two.jpg | 2 |
| gained | The Beano |  | 3715 | 1180507 |  | comicvine/the-beano/vol-26847/457533-issue-3715.jpg | 1 |
| gained | Spawn | 2021 | 323 | 2282793 |  | comicvine/spawn/vol-4937/891591-issue-323.jpg | 1 |
| gained | Batman | 2009 | 683 | 882758 |  | comicvine/batman/vol-796/148610-what-the-butler-saw.jpg | 2 |
| gained | Action Comics | 1983 | 549 | 1800345 |  | comicvine/action-comics/vol-18005/120210-superman-meets-the-zod-squad.jpg | 2 |
| gained | The Beano |  | 1862 | 162353 |  | comicvine/the-beano/vol-26847/484068-issue-1862.jpg | 1 |
| gained | Detective Comics | 1988 | 586 | 44484 |  | comicvine/detective-comics/vol-18058/113054-rat-trap.jpg | 1 |
| gained | The Beezer |  | 771 | 584736 |  | comicvine/the-beezer/vol-27927/945345-issue-771.jpg | 1 |
| gained | Detective Comics | 1986 | 569 | 1973990 |  | comicvine/detective-comics/vol-18058/113027-catch-as-catscan.jpg | 2 |
| gained | Spawn | 2021 | 320 | 2267663 |  | comicvine/spawn/vol-4937/874818-issue-320.jpg | 2 |
| gained | Batman | 2007 | 669 | 369827 |  | comicvine/batman/vol-796/115088-the-dark-knight-must-die.jpg | 1 |
| gained | Archie | 2015 | 662 | 1335072 |  | comicvine/archie/vol-9628/472015-we-wish-you-a-marry-christmas.jpg | 2 |
| gained | The Beano |  | 3851 | 1631274 |  | comicvine/the-beano/vol-26847/550067-issue-3851.jpg | 1 |
| gained | Action Comics | 2006 | 834 | 259921 |  | comicvine/action-comics/vol-18005/111898-awake-in-the-dark.jpg | 1 |
| gained | The Beano |  | 2521 | 163012 |  | comicvine/the-beano/vol-26847/342555-issue-2521.jpg | 1 |
| gained | Action Comics | 2002 | 790 | 1680146 |  | comicvine/action-comics/vol-18005/113287-man-beast-part-2.jpg | 2 |
| gained | Detective Comics | 1995 | 692 | 58114 |  | comicvine/detective-comics/vol-18058/113154-lying-eyes.jpg | 1 |
| gained | Action Comics | 1991 | 670 | 872988 |  | comicvine/action-comics/vol-18005/113845-skullduggery.jpg | 2 |
| gained | The Beezer |  | 289 | 584254 |  | comicvine/the-beezer/vol-27927/945241-issue-289.jpg | 1 |
| gained | The Beano |  | 3053 | 163544 |  | comicvine/the-beano/vol-26847/494773-issue-3053.jpg | 1 |
| gained | Detective Comics | 1984 | 540 | 891739 |  | comicvine/detective-comics/vol-18058/112995-something-scary-in-cold-type.jpg | 2 |
| gained | The Beano |  | 1284 | 161775 |  | comicvine/the-beano/vol-26847/752148-issue-1284.jpg | 1 |
| gained | Action Comics | 1982 | 533 | 36476 |  | comicvine/action-comics/vol-18005/120767-trackdown-ground-zero-where.jpg | 1 |
| gained | Spawn | 2021 | 321 | 2268671 |  | comicvine/spawn/vol-4937/882912-issue-321.jpg | 1 |
| gained | Batman | 2010 | 696 | 721982 |  | comicvine/batman/vol-796/197348-life-after-death-part-5-mind-games.jpg | 1 |
| gained | The Beano |  | 2502 | 162993 |  | comicvine/the-beano/vol-26847/223110-issue-2502.jpg | 1 |
| gained | Action Comics | 1985 | 571 | 1919009 |  | comicvine/action-comics/vol-18005/119353-mission-to-earth.jpg | 2 |
| gained | Detective Comics | 1987 | 571 | 42533 |  | comicvine/detective-comics/vol-18058/113033-fear-for-sale.jpg | 1 |
| gained | Action Comics | 2009 | 875 | 2551314 |  | comicvine/action-comics/vol-18005/153515-the-sleeper-part-1.jpg | 2 |
| gained | Detective Comics | 1990 | 613 | 1942495 |  | comicvine/detective-comics/vol-18058/113072-trash.jpg | 2 |
| gained | The Beano |  | 3666 | 1180458 |  | comicvine/the-beano/vol-26847/377127-issue-3666.jpg | 1 |
| gained | Action Comics | 1984 | 560 | 1917556 |  | comicvine/action-comics/vol-18005/114062-meet-john-doe-police-blotter.jpg | 2 |
| gained | The Beano |  | 2404 | 162895 |  | comicvine/the-beano/vol-26847/340562-issue-2404.jpg | 1 |
| gained | Action Comics | 2000 | 769 | 2011760 |  | comicvine/action-comics/vol-18005/114516-superman-arkham-part-4-supermanamrepus.jpg | 2 |
| gained | The Beezer |  | 832 | 584797 |  | comicvine/the-beezer/vol-27927/828710-issue-832.jpg | 1 |
| gained | Batman | 2005 | 640 | 242698 |  | comicvine/batman/vol-796/122133-family-reunion-part-2-while-the-cat-s-away.jpg | 1 |
| gained | Archie | 2011 | 617 | 1254597 |  | comicvine/archie/vol-9628/261632-campaign-pains-part-two.jpg | 2 |
| gained | Action Comics | 2009 | 875 | 562838 |  | comicvine/action-comics/vol-18005/153515-the-sleeper-part-1.jpg | 1 |
| gained | Detective Comics | 1983 | 532 | 37983 |  | comicvine/detective-comics/vol-18058/112987-laugh-killer-laugh-soft-targets.jpg | 1 |
| gained | The Beano |  | 2770 | 163261 |  | comicvine/the-beano/vol-26847/739424-issue-2770.jpg | 1 |
| gained | Batman | 2011 | 712 | 2118502 |  | comicvine/batman/vol-796/280287-pieces-part-three-gilded-lily.jpg | 2 |
| gained | The Beano |  | 2025 | 162516 |  | comicvine/the-beano/vol-26847/759899-issue-2025.jpg | 1 |
| gained | Detective Comics | 2010 | 859 | 2041579 |  | comicvine/detective-comics/vol-18058/184826-seven-years-ago-pipeline-chapter-two-part-one.jpg | 2 |
| gained | Batman | 2001 | 591 | 1864357 |  | comicvine/batman/vol-796/83259-shot-through-the-heart-part-1.jpg | 2 |
| gained | The Beano |  | 3937 | 1819509 |  | comicvine/the-beano/vol-26847/673775-issue-3937.jpg | 1 |
| gained | The Beano |  | 2265 | 162756 |  | comicvine/the-beano/vol-26847/342527-issue-2265.jpg | 1 |
| gained | Action Comics | 1998 | 1,000,000 | 236200 |  | comicvine/action-comics/vol-42563/291123-superman-versus-the-city-of-tomorrow.jpg | 2 |
| gained | Detective Comics | 1988 | 593 | 1838154 |  | comicvine/detective-comics/vol-18058/113061-the-fear-part-two-diary-of-a-madman.jpg | 2 |
| gained | Batman | 2006 | 657 | 292893 |  | comicvine/batman/vol-796/121734-batman-son-part-3-wonderboys.jpg | 1 |
| gained | The Beano |  | 2246 | 162737 |  | comicvine/the-beano/vol-26847/738995-issue-2246.jpg | 1 |
| gained | Action Comics | 1984 | 556 | 38722 |  | comicvine/action-comics/vol-18005/120099-endings.jpg | 1 |
| gained | The Beano |  | 1858 | 162349 |  | comicvine/the-beano/vol-26847/484064-issue-1858.jpg | 1 |
| gained | Action Comics | 1987 | 594 | 43535 |  | comicvine/action-comics/vol-18005/116252-all-that-glisters.jpg | 1 |
| gained | Detective Comics | 1996 | 694 | 2146629 |  | comicvine/detective-comics/vol-18058/113156-violent-reactions.jpg | 2 |
| gained | The Beezer |  | 229 | 584194 |  | comicvine/the-beezer/vol-27927/928189-issue-229.jpg | 1 |
| gained | Archie | 2013 | 640 | 2707934 |  | comicvine/archie/vol-9628/377048-full-muddle-jacket-a-hanging-offense-or-the-art-upstart-date-n-tackle.jpg | 2 |
| gained | Action Comics | 2000 | 764 | 92115 |  | comicvine/action-comics/vol-18005/114749-quiet-after-the-storm.jpg | 1 |
| gained | The Beano |  | 1387 | 161878 |  | comicvine/the-beano/vol-26847/769591-issue-1387.jpg | 1 |
| gained | Action Comics | 1991 | 667 | 49782 |  | comicvine/action-comics/vol-18005/117645-the-final-chapter.jpg | 1 |
| gained | The Beano |  | 1704 | 162195 |  | comicvine/the-beano/vol-26847/767955-issue-1704.jpg | 1 |
| gained | Action Comics | 1984 | 560 | 39141 |  | comicvine/action-comics/vol-18005/114062-meet-john-doe-police-blotter.jpg | 1 |
| gained | Detective Comics | 1987 | 580 | 43629 |  | comicvine/detective-comics/vol-18058/113048-double-image.jpg | 1 |
| gained | Archie | 2014 | 653 | 1189354 |  | comicvine/archie/vol-9628/447158-the-archies-rockin-world-tour-part-4-close-to-the-borderline.jpg | 2 |
| gained | The Beano |  | 2395 | 162886 |  | comicvine/the-beano/vol-26847/164817-issue-2395.jpg | 1 |
| gained | Action Comics | 1995 | 716 | 92067 |  | comicvine/action-comics/vol-18005/115518-fugitive-justice.jpg | 1 |
| gained | Detective Comics | 2003 | 784 | 167380 |  | comicvine/detective-comics/vol-18058/113352-made-of-wood-part-1-trading-up.jpg | 1 |
| gained | Batman | 2000 | 573 | 216807 |  | comicvine/batman/vol-796/98688-shellgame-part-1-gambits.jpg | 1 |
| gained | Action Comics | 1984 | 562 | 1049189 |  | comicvine/action-comics/vol-18005/120055-their-magnetic-majesties-king-alexander-and-queen-bee.jpg | 2 |
| gained | Detective Comics | 2008 | 845 | 410897 |  | comicvine/detective-comics/vol-18058/113354-the-riddle-unanswered.jpg | 1 |
| gained | The Beezer |  | 1016 | 584981 |  | comicvine/the-beezer/vol-27927/348416-5-july-1975.jpg | 1 |
| gained | The Beano |  | 3972 | 1955763 |  | comicvine/the-beano/vol-26847/703283-issue-3972.jpg | 1 |
| gained | Action Comics | 1994 | 696 | 2221514 |  | comicvine/action-comics/vol-18005/116058-champion.jpg | 2 |
| gained | Detective Comics | 1986 | 561 | 1705123 |  | comicvine/detective-comics/vol-18058/113019-flying-hi-in-the-grip-of-steelclaw.jpg | 2 |
| gained | Action Comics | 1990 | 660 | 48794 |  | comicvine/action-comics/vol-18005/113904-certain-death.jpg | 1 |
| gained | Detective Comics | 2005 | 804 | 224310 |  | comicvine/detective-comics/vol-18058/113388-city-of-crime-part-4-all-you-need-is-love-love-love-love-love-love-when-you-re-strange-part-4.jpg | 1 |
| gained | The Beano |  | 2917 | 163408 |  | comicvine/the-beano/vol-26847/494933-issue-2917.jpg | 1 |
| gained | Action Comics | 2008 | 866 | 2256432 |  | comicvine/action-comics/vol-18005/131393-brainiac-part-1-first-contact.jpg | 2 |
| gained | Detective Comics | 2006 | 822 | 2174312 |  | comicvine/detective-comics/vol-18058/113418-e-nigma-consulting-detective.jpg | 2 |
| gained | The Beano | 2017 | 3885 | 1702816 |  | comicvine/the-beano/vol-26847/599970-issue-3885.jpg | 1 |
| gained | The Beezer |  | 1634 | 585599 |  | comicvine/the-beezer/vol-27927/945227-issue-1634.jpg | 1 |
| gained | The Beano |  | 4178 | 2585620 |  | comicvine/the-beano/vol-26847/979593-issue-4178.png | 1 |
| gained | The Beano |  | 2271 | 162762 |  | comicvine/the-beano/vol-26847/491363-issue-2271.jpg | 1 |
| gained | Action Comics | 1982 | 529 | 868141 |  | comicvine/action-comics/vol-18005/120770-i-have-two-eyes-but-i-cannot-see-death-if-by-land-death-if-by-sea.jpg | 2 |
| gained | Detective Comics | 2001 | 760 | 100054 |  | comicvine/detective-comics/vol-18058/113226-unknowing-part-3-trail-of-the-catwoman-part-2.jpg | 1 |
| gained | The Beezer |  | 922 | 584887 |  | comicvine/the-beezer/vol-27927/831698-issue-922.jpg | 1 |
| gained | Batman | 2008 | 678 | 879643 |  | comicvine/batman/vol-796/132216-batman-r-i-p-zur-en-arrh.jpg | 2 |
| gained | The Beano |  | 3765 | 1301872 |  | comicvine/the-beano/vol-26847/1049716-issue-3765.jpg | 1 |
| gained | Action Comics | 1994 | 703 | 873044 |  | comicvine/action-comics/vol-18005/115770-chronocide.jpg | 2 |
| gained | Batman | 2000 | 576 | 2011962 |  | comicvine/batman/vol-796/98691-in-the-dark-places.jpg | 2 |
| lost | Carnage |  | 2 | 2707908 | comicvine/carnage/vol-85938/506648-issue-2.jpg |  |  |
| gained | Carnage | 2024 | 8 (38) | 2635931 |  | comicvine/carnage/vol-154836/1058723-the-ship-and-the-river.jpg | 2 |
| lost | Carnage |  | 1 | 1602377 | comicvine/carnage/vol-85938/505515-the-one-that-got-away-part-one.jpg |  |  |
| lost | From Hell |  | 1 | 672838 | comicvine/from-hell/vol-26681/159906-prologue-the-old-men-on-the-shore.jpg |  |  |
| lost | Carnage |  | 3 | 1721927 | comicvine/carnage/vol-85938/509698-issue-3.jpg |  |  |
| lost | Carnage | 2023 | 1 | 2709903 | comicvine/carnage/vol-141919/911320-in-the-court-of-crimson.jpg |  |  |
| gained | Carnage | 2024 | 1 (31) | 2612934 |  | comicvine/carnage/vol-154836/1030841-issue-1.jpeg | 2 |
| gained | Carnage | 2024 | 3 (33) | 2607077 |  | comicvine/carnage/vol-154836/1042824-issue-3.jpg | 2 |
| lost | Carnage | 2022 | 1 | 2456777 | comicvine/carnage/vol-141919/911320-in-the-court-of-crimson.jpg |  |  |
| lost | Carnage |  | 1 | 1610001 | comicvine/carnage/vol-85938/505515-the-one-that-got-away-part-one.jpg |  |  |
| gained | Carnage | 2024 | 6 (36) | 2622545 |  | comicvine/carnage/vol-154836/1051120-symbiosis-necrosis-part-4-his-father-s-son.jpg | 2 |
| gained | Carnage | 2024 | 6 (36) | 2622630 |  | comicvine/carnage/vol-154836/1051120-symbiosis-necrosis-part-4-his-father-s-son.jpg | 2 |
| lost | Carnage |  | 1 | 2466284 | comicvine/carnage/vol-85938/505515-the-one-that-got-away-part-one.jpg |  |  |
| gained | Carnage | 2024 | 4 (34) | 2613070 |  | comicvine/carnage/vol-154836/1046264-issue-4.jpg | 2 |
| gained | Carnage | 2024 | 2 (32) | 2607053 |  | comicvine/carnage/vol-154836/1038386-issue-2.jpg | 2 |
| gained | Carnage | 2024 | 4 (34) | 2613074 |  | comicvine/carnage/vol-154836/1046264-issue-4.jpg | 2 |
| gained | Carnage | 2024 | 5 (35) | 2616513 |  | comicvine/carnage/vol-154836/1047945-symbiosis-necrosis-part-2-the-father.jpg | 2 |
| gained | Carnage | 2024 | 7 (37) | 2631740 |  | comicvine/carnage/vol-154836/1055023-all-hell-let-loose.jpg | 2 |
| lost | Wynd | 2021 | 1 | 2221212 | comicvine/wynd/vol-127982/768557-book-one-the-flight-of-the-prince.jpg |  |  |
| lost | Carnage | 2016 | 1 | 1562782 | comicvine/carnage/vol-85938/505515-the-one-that-got-away-part-one.jpg |  |  |
| lost | Grimm |  | 1 | 1977138 | comicvine/grimm/vol-60788/401232-issue-1.jpg |  |  |
| gained | Carnage | 2024 | 1 (31) | 2582050 |  | comicvine/carnage/vol-154836/1030841-issue-1.jpeg | 2 |
| lost | Carnage | 2024 | 1 | 2627482 | comicvine/carnage/vol-154836/1030841-issue-1.jpeg |  |  |
| lost | Carnage | 2017 | 3 | 1693500 | comicvine/carnage/vol-85938/509698-issue-3.jpg |  |  |
| lost | Carnage | 2016 | 2 | 1641210 | comicvine/carnage/vol-85938/506648-issue-2.jpg |  |  |
| lost | Carnage |  | 2 | 2560255 | comicvine/carnage/vol-85938/506648-issue-2.jpg |  |  |
| lost | Carnage | 2023 | 2 | 2537471 | comicvine/carnage/vol-141919/919309-transformation.jpg |  |  |
| lost | New Warriors | 2014 | 1 | 1385542 | comicvine/new-warriors/vol-71802/445817-the-kids-are-all-fight-part-1.jpg |  |  |
| gained | Carnage | 2024 | 3 (33) | 2607052 |  | comicvine/carnage/vol-154836/1042824-issue-3.jpg | 2 |
| gained | Carnage | 2024 | 4 (34) | 2612720 |  | comicvine/carnage/vol-154836/1046264-issue-4.jpg | 2 |
| lost | From Hell |  | 5 | 672842 | comicvine/from-hell/vol-26681/161137-issue-5.jpg |  |  |
| gained | Carnage | 2024 | 2 (32) | 2593106 |  | comicvine/carnage/vol-154836/1038386-issue-2.jpg | 2 |
| gained | Carnage | 2024 | 6 (36) | 2622623 |  | comicvine/carnage/vol-154836/1051120-symbiosis-necrosis-part-4-his-father-s-son.jpg | 2 |
| gained | Detective Comics | 1984 | 544 | 39327 |  | comicvine/detective-comics/vol-18058/112999-deceit-in-dark-secrets-fair-from-the-madding-crowd.jpg | 1 |
| gained | Action Comics | 1985 | 568 | 40047 |  | comicvine/action-comics/vol-18005/119933-disappearing-act-the-amazing-matchmaker-of-metropolis.jpg | 1 |
| gained | Detective Comics | 1994 | 670 | 54452 |  | comicvine/detective-comics/vol-18058/106839-cold-cases.jpg | 1 |
| gained | Batman | 1997 | 541 | 60135 |  | comicvine/batman/vol-796/43550-the-spectre-of-vengeance-part-2-mask-of-guilt.jpg | 1 |
| gained | Batman | 1998 | 553 | 61651 |  | comicvine/batman/vol-796/44894-lifelines-cataclysm-part-3.jpg | 1 |
| lost | Super DC Giant | 1971 | S-21 | 75447 | comicvine/super-dc-giant/vol-2466/56810-love-1971.jpg |  |  |
| gained | Action Comics | 1998 | 743 | 92094 |  | comicvine/action-comics/vol-18005/115380-operation-ink.jpg | 1 |
| gained | The Beano |  | 1035 | 161526 |  | comicvine/the-beano/vol-26847/738133-issue-1035.jpg | 1 |
| gained | The Beano |  | 1097 | 161588 |  | comicvine/the-beano/vol-26847/277568-issue-1097.jpg | 1 |
| gained | The Beano |  | 1266 | 161757 |  | comicvine/the-beano/vol-26847/769523-issue-1266.jpg | 1 |
| gained | The Beano |  | 1267 | 161758 |  | comicvine/the-beano/vol-26847/277572-issue-1267.jpg | 1 |
| gained | The Beano |  | 1465 | 161956 |  | comicvine/the-beano/vol-26847/758252-issue-1465.jpg | 1 |
| gained | The Beano |  | 1502 | 161993 |  | comicvine/the-beano/vol-26847/759520-issue-1502.jpg | 1 |
| gained | The Beano |  | 1516 | 162007 |  | comicvine/the-beano/vol-26847/760280-issue-1516.jpg | 1 |
| gained | The Beano |  | 1563 | 162054 |  | comicvine/the-beano/vol-26847/761754-issue-1563.jpg | 1 |
| gained | The Beano |  | 1624 | 162115 |  | comicvine/the-beano/vol-26847/764710-issue-1624.jpg | 1 |
| gained | The Beano |  | 1651 | 162142 |  | comicvine/the-beano/vol-26847/766454-issue-1651.jpg | 1 |
| gained | The Beano |  | 1750 | 162241 |  | comicvine/the-beano/vol-26847/484038-issue-1750.jpg | 1 |
| gained | The Beano |  | 1819 | 162310 |  | comicvine/the-beano/vol-26847/768502-issue-1819.jpg | 1 |
| gained | The Beano |  | 2267 | 162758 |  | comicvine/the-beano/vol-26847/215594-issue-2267.jpg | 1 |
| gained | The Beano |  | 2389 | 162880 |  | comicvine/the-beano/vol-26847/340528-issue-2389.jpg | 1 |
| gained | The Beano |  | 2536 | 163027 |  | comicvine/the-beano/vol-26847/491373-issue-2536.jpg | 1 |
| gained | The Beano |  | 2578 | 163069 |  | comicvine/the-beano/vol-26847/161469-issue-2578.jpg | 1 |
| gained | The Beano |  | 2687 | 163178 |  | comicvine/the-beano/vol-26847/228830-issue-2687.jpg | 1 |
| gained | The Beano |  | 2849 | 163340 |  | comicvine/the-beano/vol-26847/756689-issue-2849.jpg | 1 |
| gained | My Little Margie | 1959 | 27 | 169955 |  | comicvine/my-little-margie/vol-27086/243835-issue-27.jpg | 1 |
| gained | My Little Margie | 1960 | 32 | 169960 |  | comicvine/my-little-margie/vol-27086/243838-issue-32.jpg | 1 |
| gained | Love Diary | 1963 | 25 | 170021 |  | comicvine/love-diary/vol-23298/243493-issue-25.jpg | 1 |
| gained | Breakneck Blvd. | 1996 | 6 | 255383 |  | comicvine/breakneck-blvd/vol-38025/449199-issue-6.jpg | 1 |
| gained | 150 New Cartoons | 1969 | 29 | 382128 |  | comicvine/150-new-cartoons/vol-29067/841341-issue-29.jpg | 1 |
| gained | The Beezer |  | 1186 | 585151 |  | comicvine/the-beezer/vol-27927/840653-issue-1186.jpg | 1 |
| gained | The Beezer |  | 1427 | 585392 |  | comicvine/the-beezer/vol-27927/849785-issue-1427.jpg | 1 |
| gained | The Beano |  | 3600 | 1000982 |  | comicvine/the-beano/vol-26847/289220-issue-3600.jpg | 1 |
| gained | Marvel Super Adventure |  | 5 | 1052200 |  | comicvine/marvel-super-adventure/vol-47550/326934-issue-5.jpg | 1 |
| gained | Ghostbusters | 2013 | 5 | 1128151 |  | comicvine/ghostbusters/vol-43066/311743-issue-5.jpg | 1 |
| gained | Daredevil | 2014 | 36 (1.50) | 1197241 |  | comicvine/daredevil/vol-41410/445812-i-am-daredevil.jpg | 1 |
| gained | Mickey Mouse | 2016 | 11 / 320 | 1551539 |  | comicvine/mickey-mouse/vol-82975/523123-issue-11.jpg | 1 |
| changed | Justice League | 2018 | 37 | 1776091 | comicvine/justice-league/vol-92373/654038-the-people-vs-justice-league-part-4-the-fan.jpg | comicvine/justice-league/vol-42488/473591-the-amazo-virus-chapter-two-patient-zero.jpg | 1 |
| gained | Titans | 2019 | 5 | 1923854 |  | comicvine/titans/vol-92577/558945-the-return-of-wally-west-part-five-run-for-their-lives.jpg | 1 |
| gained | Uncanny X-Men | 2019 | 19 (641) | 1974693 |  | comicvine/uncanny-x-men/vol-115285/710699-we-have-always-been-part-3.jpg | 1 |
| gained | The Amazing Spider-Man | 2023 | 30 (924) | 2558690 |  | comicvine/the-amazing-spider-man/vol-142577/1003569-issue-30.jpg | 1 |
| gained | Captain Marvel Jr. | 1943 | 12 | 3171 |  | comicvine/captain-marvel-jr/vol-62308/780973-issue-12.jpg | 1 |
| gained | Action Comics | 1981 | 525 | 35770 |  | comicvine/action-comics/vol-18005/112405-neutron-nightmare-air-wave-goes-blank.jpg | 1 |
| gained | Action Comics | 1987 | 589 | 42916 |  | comicvine/action-comics/vol-18005/119277-green-on-green.jpg | 1 |
| gained | Action Comics | 1994 | 696 | 54511 |  | comicvine/action-comics/vol-18005/116058-champion.jpg | 1 |
| gained | Detective Comics | 1995 | 685 | 57072 |  | comicvine/detective-comics/vol-18058/113147-war-of-the-dragons-part-one-the-iron-dragon.jpg | 1 |
| gained | Detective Comics | 1996 | 698 | 59059 |  | comicvine/detective-comics/vol-18058/113158-the-tomb.jpg | 1 |
| gained | Batman | 1997 | 548 | 60943 |  | comicvine/batman/vol-796/44266-the-penguin-returns-part-one-burning-faces.jpg | 1 |
| gained | Peter Parker: Spider-Man | 2002 | 38 (136) | 87700 |  | comicvine/peter-parker-spider-man/vol-9142/68515-make-mime-marvel.jpg | 1 |
| gained | Batman | 2002 | 607 | 123991 |  | comicvine/batman/vol-796/124874-death-wish-for-two-conclusion-deadshot-shot-dead.jpg | 1 |
| gained | The Beano |  | 983 | 161474 |  | comicvine/the-beano/vol-26847/737566-issue-983.jpg | 1 |
| gained | The Beano |  | 1016 | 161507 |  | comicvine/the-beano/vol-26847/737966-issue-1016.jpg | 1 |
| gained | The Beano |  | 1161 | 161652 |  | comicvine/the-beano/vol-26847/741029-issue-1161.jpg | 1 |
| gained | The Beano | 1966 | 1241 | 161732 |  | comicvine/the-beano/vol-26847/769509-issue-1241.jpg | 1 |
| gained | The Beano |  | 1304 | 161795 |  | comicvine/the-beano/vol-26847/752806-issue-1304.jpg | 1 |
| gained | The Beano |  | 1549 | 162040 |  | comicvine/the-beano/vol-26847/565801-issue-1549.jpg | 1 |
| gained | The Beano |  | 1676 | 162167 |  | comicvine/the-beano/vol-26847/491341-issue-1676.jpg | 1 |
| gained | The Beano |  | 1895 | 162386 |  | comicvine/the-beano/vol-26847/459459-issue-1895.jpg | 1 |
| gained | The Beano |  | 2125 | 162616 |  | comicvine/the-beano/vol-26847/757815-issue-2125.jpg | 1 |
| gained | The Beano |  | 2511 | 163002 |  | comicvine/the-beano/vol-26847/342546-issue-2511.jpg | 1 |
| gained | The Beano |  | 2540 | 163031 |  | comicvine/the-beano/vol-26847/734404-issue-2540.jpg | 1 |
| gained | The Beano |  | 2672 | 163163 |  | comicvine/the-beano/vol-26847/737664-issue-2672.jpg | 1 |
| gained | The Beano |  | 2826 | 163317 |  | comicvine/the-beano/vol-26847/753094-issue-2826.jpg | 1 |
| gained | The Beano |  | 2923 | 163414 |  | comicvine/the-beano/vol-26847/495170-issue-2923.jpg | 1 |
| gained | The Beano |  | 3108 | 163599 |  | comicvine/the-beano/vol-26847/763396-issue-3108.jpg | 1 |
| gained | My Little Margie | 1962 | 40 | 169968 |  | comicvine/my-little-margie/vol-27086/243598-issue-40.jpg | 1 |
| gained | Just Married | 1972 | 82 | 170213 |  | comicvine/just-married/vol-36620/243232-issue-82.jpg | 1 |
| gained | Action Comics | 2005 | 823 | 224125 |  | comicvine/action-comics/vol-18005/112959-repo-man-part-2.jpg | 1 |
| gained | Dr. Radium, Man of Science | 1993 | 3 | 260634 |  | comicvine/dr-radium-man-of-science/vol-50975/348891-issue-3.jpg | 1 |
| gained | Dr. Radium, Man of Science | 1995 | 5 | 260636 |  | comicvine/dr-radium-man-of-science/vol-50975/441088-issue-5.jpg | 1 |
| gained | Slacker Comics |  | 16 | 371445 |  | comicvine/slacker-comics/vol-30288/318607-issue-16.jpg | 1 |
| gained | The Beano |  | 3259 | 596802 |  | comicvine/the-beano/vol-26847/768217-issue-3259.jpg | 1 |
| gained | The Beano |  | 3444 | 597127 |  | comicvine/the-beano/vol-26847/780425-issue-3444.jpg | 1 |
| gained | The Beano |  | 3448 | 597131 |  | comicvine/the-beano/vol-26847/780641-issue-3448.jpg | 1 |
| gained | Action Comics | 2009 | 880 | 669657 |  | comicvine/action-comics/vol-18005/166782-codename-patriot.jpg | 1 |
| gained | Life of a Fetus |  | 5 | 734695 |  | comicvine/life-of-a-fetus/vol-56151/382355-issue-5.jpg | 1 |
| gained | Conan the Cimmerian | 2010 | 25 / 75 | 790064 |  | comicvine/conan-the-cimmerian/vol-21896/246463-iron-shadows-in-the-moon-part-4-of-4-monsters.jpg | 1 |
| gained | Morbus Gravis | 1997 | 1 | 862583 |  | comicvine/morbus-gravis/vol-73550/452029-issue-1.jpg | 1 |
| gained | Uncanny X-Force | 2012 | 5 | 944825 |  | comicvine/uncanny-x-force/vol-35835/262615-deathlok-nation-part-one.jpg | 1 |
| gained | The Beano |  | 3640 | 1001022 |  | comicvine/the-beano/vol-26847/347017-issue-3640.jpg | 1 |
| gained | The Beano |  | 3651 | 1001033 |  | comicvine/the-beano/vol-26847/370470-issue-3651.png | 1 |
| gained | Marvel Super Adventure |  | 8 | 1052203 |  | comicvine/marvel-super-adventure/vol-47550/326937-issue-8.jpg | 1 |
| gained | The Beano |  | 3723 | 1212519 |  | comicvine/the-beano/vol-26847/457539-issue-3723.jpg | 1 |
| gained | Abe Sapien | 2014 | 18 (28) | 1288552 |  | comicvine/abe-sapien/vol-59507/472873-grace.jpg | 1 |
| gained | Blade of the Immortal | 2014 | 30 | 1325307 |  | comicvine/blade-of-the-immortal/vol-9069/63099-dark-shadows-part-2-of-5.jpg | 1 |
| gained | The Complete Chester Gould's Dick Tracy | 2014 | 17 - 1956-1957 | 1344791 |  | comicvine/the-complete-chester-gould-s-dick-tracy/vol-35391/467057-1956-57.jpg | 1 |
| gained | The Complete Chester Gould's Dick Tracy | 2015 | 18 - 1957-1959 | 1344792 |  | comicvine/the-complete-chester-gould-s-dick-tracy/vol-35391/487252-volume-18-1957-1959.jpg | 1 |
| gained | Teenage Mutant Ninja Turtles | 2014 | 9 | 1602503 |  | comicvine/teenage-mutant-ninja-turtles/vol-42285/333542-issue-9.jpg | 1 |
| gained | The Beano | 2017 | 3875 | 1679929 |  | comicvine/the-beano/vol-26847/588079-issue-3875.jpg | 1 |
| gained | The Beano | 2017 | 3895 | 1736601 |  | comicvine/the-beano/vol-26847/611950-lolly-wars.jpg | 1 |
| gained | The Beano |  | 4050 | 2181921 |  | comicvine/the-beano/vol-26847/797118-issue-4050.jpg | 1 |
| gained | Lumberjanes | 2021 | 19 | 2255519 |  | comicvine/lumberjanes/vol-72941/503604-chapter-nineteen-ensemble-assemble.jpg | 1 |
| gained | The Beano |  | 4083 | 2288378 |  | comicvine/the-beano/vol-26847/845563-issue-4083.jpg | 1 |
| gained | Venom | 2022 | 11 (211) | 2440576 |  | comicvine/venom/vol-140084/950377-venomworld-part-one.jpg | 1 |
| gained | The Amazing Spider-Man | 2023 | 22 (916) | 2510830 |  | comicvine/the-amazing-spider-man/vol-142577/978479-issue-22.jpg | 1 |
| gained | Grimm Fairy Tales | 2023 | 73 | 2564516 |  | comicvine/grimm-fairy-tales/vol-19824/336110-ghost-in-the-myst.jpg | 1 |
| gained | X-Men | 2025 | 17 (317) | 2744457 |  | comicvine/x-men/vol-137402/956846-size-matters.jpg | 1 |
| gained | Captain Marvel Jr. | 1950 | 85 | 8249 |  | comicvine/captain-marvel-jr/vol-62308/780991-issue-85.jpg | 1 |
| gained | Action Comics | 2000 | 765 | 92116 |  | comicvine/action-comics/vol-18005/114691-a-clown-comes-to-metropolis.jpg | 1 |
| gained | Action Comics | 2003 | 799 | 125285 |  | comicvine/action-comics/vol-18005/113722-the-cage.jpg | 1 |
| gained | Dennis the Menace Pocket Full of Fun | 1977 | 33 | 132542 |  | comicvine/dennis-the-menace-pocket-full-of-fun/vol-38357/257144-the-dennis-go-round.jpg | 1 |
| gained | The Beano |  | 1144 | 161635 |  | comicvine/the-beano/vol-26847/740222-issue-1144.jpg | 1 |
| gained | The Beano |  | 1261 | 161752 |  | comicvine/the-beano/vol-26847/751516-issue-1261.jpg | 1 |
| gained | The Beano |  | 1295 | 161786 |  | comicvine/the-beano/vol-26847/752804-issue-1295.jpg | 1 |
| gained | The Beano |  | 1331 | 161822 |  | comicvine/the-beano/vol-26847/376724-issue-1331.jpg | 1 |
| gained | The Beano |  | 1401 | 161892 |  | comicvine/the-beano/vol-26847/754704-issue-1401.jpg | 1 |
| gained | The Beano |  | 1416 | 161907 |  | comicvine/the-beano/vol-26847/235267-issue-1416.jpg | 1 |
| gained | The Beano |  | 1483 | 161974 |  | comicvine/the-beano/vol-26847/759254-issue-1483.jpg | 1 |
| gained | The Beano |  | 1589 | 162080 |  | comicvine/the-beano/vol-26847/491338-issue-1589.jpg | 1 |
| gained | The Beano |  | 1820 | 162311 |  | comicvine/the-beano/vol-26847/768501-issue-1820.jpg | 1 |
| gained | The Beano |  | 1829 | 162320 |  | comicvine/the-beano/vol-26847/344175-issue-1829.jpg | 1 |
| gained | The Beano |  | 1841 | 162332 |  | comicvine/the-beano/vol-26847/767738-issue-1841.jpg | 1 |
| gained | The Beano |  | 1932 | 162423 |  | comicvine/the-beano/vol-26847/762242-issue-1932.jpg | 1 |
| gained | The Beano |  | 1933 | 162424 |  | comicvine/the-beano/vol-26847/460160-issue-1933.jpg | 1 |
| gained | The Beano |  | 2093 | 162584 |  | comicvine/the-beano/vol-26847/276561-issue-2093.jpg | 1 |
| gained | The Beano |  | 2140 | 162631 |  | comicvine/the-beano/vol-26847/342756-issue-2140.jpg | 1 |
| gained | The Beano |  | 2373 | 162864 |  | comicvine/the-beano/vol-26847/734408-issue-2373.jpg | 1 |
| gained | The Beano |  | 2437 | 162928 |  | comicvine/the-beano/vol-26847/222813-issue-2437.jpg | 1 |
| gained | The Beano |  | 2659 | 163150 |  | comicvine/the-beano/vol-26847/737315-issue-2659.jpg | 1 |
| gained | The Beano |  | 2911 | 163402 |  | comicvine/the-beano/vol-26847/494901-issue-2911.jpg | 1 |
| gained | Drag N' Wheels | 1970 | 40 | 168278 |  | comicvine/drag-n-wheels/vol-36577/242498-issue-40.jpg | 1 |
| gained | Love Diary | 1969 | 62 | 170058 |  | comicvine/love-diary/vol-23298/243526-issue-62.jpg | 1 |
| gained | Batman | 2000 | 583 | 216817 |  | comicvine/batman/vol-796/98698-fearless-part-2.jpg | 1 |
| gained | Sick | 1977 | 114 | 326542 |  | comicvine/sick/vol-58859/394636-issue-114.jpg | 1 |
| gained | The Beezer |  | 757 | 584722 |  | comicvine/the-beezer/vol-27927/945333-issue-757.jpg | 1 |
| gained | The Beezer |  | 1581 | 585546 |  | comicvine/the-beezer/vol-27927/392493-issue-1581.jpg | 1 |
| gained | Adventure Comics | 2010 | 10 / 513 | 746131 |  | comicvine/adventure-comics/vol-25643/207745-part-six-divided-conquerable-awake-part-3.jpg | 1 |
| gained | Exiles | 2005 | 9 | 787881 |  | comicvine/exiles/vol-6983/105362-a-world-apart-part-2-of-3.jpg | 1 |
| gained | Exiles | 2007 | 15 | 787887 |  | comicvine/exiles/vol-6983/105367-i-cover-the-waterfront-part-2.jpg | 1 |
| gained | Forces in Combat |  | 19 | 889481 |  | comicvine/forces-in-combat/vol-34688/321316-issue-19.jpg | 1 |
| gained | Forces in Combat |  | 35 | 889497 |  | comicvine/forces-in-combat/vol-34688/321329-issue-35.jpg | 1 |
| gained | Conan the Barbarian | 2013 | 13 / 100 | 1079780 |  | comicvine/conan-the-barbarian/vol-44351/387232-the-woman-on-the-wall-part-one.jpg | 1 |
| gained | The Beano |  | 3679 | 1180471 |  | comicvine/the-beano/vol-26847/406796-issue-3679.jpg | 1 |
| gained | The Beano |  | 3717 | 1180509 |  | comicvine/the-beano/vol-26847/442829-issue-3717.jpg | 1 |
| gained | The Flash | 2016 | 7 | 1524730 |  | comicvine/the-flash/vol-43018/324811-into-the-light.jpeg | 1 |
| gained | The Beano |  | 3791 | 1525338 |  | comicvine/the-beano/vol-26847/494098-issue-3791.jpg | 1 |
| gained | The Beano | 2016 | 3826 | 1545383 |  | comicvine/the-beano/vol-26847/654995-issue-3826.jpg | 1 |
| gained | Sonic the Hedgehog | 2022 | 10 | 2376586 |  | comicvine/sonic-the-hedgehog/vol-109575/690435-the-battle-for-angel-island-part-2.jpg | 1 |
| gained | The Beano |  | 4136 | 2408836 |  | comicvine/the-beano/vol-26847/1049708-issue-4136.jpg | 1 |
| gained | The Beano | 2022 | 4155 | 2439516 |  | comicvine/the-beano/vol-26847/1049688-issue-4155.jpg | 1 |
| gained | The Defenders Omnibus | 2023 | 2 | 2554033 |  | comicvine/the-defenders-omnibus/vol-135301/1000251-volume-2.jpg | 1 |
| gained | Wolverine | 2024 | 1 (393) | 2656661 |  | comicvine/wolverine/vol-159705/1069428-in-the-bones.jpg | 1 |
| gained | Wolverine | 2024 | 2 (394) | 2667496 |  | comicvine/wolverine/vol-159705/1073896-blood-and-debt.jpg | 1 |
| gained | Detective Comics | 1992 | 654 | 52207 |  | comicvine/detective-comics/vol-18058/113125-god-of-battle.png | 1 |
| gained | Batman | 1999 | 563 | 62604 |  | comicvine/batman/vol-796/45729-no-man-s-land-no-law-and-a-new-order-part-3-tactics.jpeg | 1 |
| gained | Dennis the Menace Pocket Full of Fun | 1973 | 16 | 132525 |  | comicvine/dennis-the-menace-pocket-full-of-fun/vol-38357/257127-best-of-dennis.jpg | 1 |
| gained | The Beano |  | 1143 | 161634 |  | comicvine/the-beano/vol-26847/739791-issue-1143.jpg | 1 |
| gained | The Beano | 1967 | 1288 | 161779 |  | comicvine/the-beano/vol-26847/591916-issue-1288.jpg | 1 |
| gained | The Beano |  | 1475 | 161966 |  | comicvine/the-beano/vol-26847/758978-issue-1475.jpg | 1 |
| gained | The Beano |  | 1566 | 162057 |  | comicvine/the-beano/vol-26847/491333-issue-1566.jpg | 1 |
| gained | The Beano |  | 1574 | 162065 |  | comicvine/the-beano/vol-26847/762054-issue-1574.jpg | 1 |
| gained | The Beano |  | 1645 | 162136 |  | comicvine/the-beano/vol-26847/766298-issue-1645.jpg | 1 |
| gained | The Beano |  | 1664 | 162155 |  | comicvine/the-beano/vol-26847/464621-issue-1664.jpg | 1 |
| gained | The Beano |  | 1667 | 162158 |  | comicvine/the-beano/vol-26847/766731-issue-1667.jpg | 1 |
| gained | The Beano |  | 1842 | 162333 |  | comicvine/the-beano/vol-26847/767737-issue-1842.jpg | 1 |
| gained | The Beano |  | 1998 | 162489 |  | comicvine/the-beano/vol-26847/460424-issue-1998.jpg | 1 |
| gained | The Beano |  | 2002 | 162493 |  | comicvine/the-beano/vol-26847/460427-issue-2002.jpg | 1 |
| gained | The Beano |  | 2061 | 162552 |  | comicvine/the-beano/vol-26847/460442-issue-2061.jpg | 1 |
| gained | The Beano |  | 2097 | 162588 |  | comicvine/the-beano/vol-26847/460519-issue-2097.jpg | 1 |
| gained | The Beano |  | 2106 | 162597 |  | comicvine/the-beano/vol-26847/460527-issue-2106.jpg | 1 |
| gained | The Beano |  | 2288 | 162779 |  | comicvine/the-beano/vol-26847/737567-issue-2288.jpg | 1 |
| gained | The Beano |  | 2517 | 163008 |  | comicvine/the-beano/vol-26847/342551-issue-2517.jpg | 1 |
| gained | The Beano |  | 2628 | 163119 |  | comicvine/the-beano/vol-26847/736469-issue-2628.jpg | 1 |
| gained | The Beano |  | 2774 | 163265 |  | comicvine/the-beano/vol-26847/739605-issue-2774.jpg | 1 |
| gained | The Beano |  | 3231 | 163722 |  | comicvine/the-beano/vol-26847/286909-issue-3231.jpg | 1 |
| gained | Love Diary | 1973 | 86 | 170082 |  | comicvine/love-diary/vol-23298/243540-issue-86.jpg | 1 |
| gained | Just Married | 1969 | 67 | 170198 |  | comicvine/just-married/vol-36620/243221-issue-67.jpg | 1 |
| gained | Detective Comics | 2006 | 813 | 274694 |  | comicvine/detective-comics/vol-18058/113409-city-of-crime-part-11-a-place-of-fear.jpg | 1 |
| gained | Detective Comics | 2007 | 835 | 311416 |  | comicvine/detective-comics/vol-18058/112669-absolute-terror-part-1-of-2.jpg | 1 |
| gained | Cartoon Carnival | 1970 | 34 | 382204 |  | comicvine/cartoon-carnival/vol-50348/347837-issue-34.jpg | 1 |
| gained | Detective Comics | 2009 | 851 | 535107 |  | comicvine/detective-comics/vol-18058/145530-batman-last-rites-last-days-of-gotham-part-1-of-2.jpg | 1 |
| gained | The Beano |  | 3247 | 596790 |  | comicvine/the-beano/vol-26847/565828-issue-3247.jpg | 1 |
| gained | The Beano |  | 3283 | 596826 |  | comicvine/the-beano/vol-26847/770219-issue-3283.jpg | 1 |
| gained | Scooby-Doo |  | 5/2008 | 643035 |  | comicvine/scooby-doo/vol-33717/219954-surf-s-up.jpg | 1 |
| gained | Twilight People | 1993 | 2 | 681147 |  | comicvine/twilight-people/vol-48740/445053-issue-2.jpg | 1 |
| gained | Batman | 2010 | 702 | 772214 |  | comicvine/batman/vol-796/231608-r-i-p-the-missing-chapter-part-2-batman-s-last-case.jpg | 1 |
| gained | Uncanny X-Force | 2012 | 4 | 944824 |  | comicvine/uncanny-x-force/vol-35835/259125-the-apocalypse-solution-part-4.jpg | 1 |
| gained | I, Vampire | 2013 | 3 | 1145600 |  | comicvine/i-vampire/vol-43017/302531-numb.jpg | 1 |
| gained | The Beano |  | 3675 | 1180467 |  | comicvine/the-beano/vol-26847/392565-issue-3675.jpg | 1 |
| gained | The Beano |  | 3763 | 1301870 |  | comicvine/the-beano/vol-26847/474007-issue-3763.jpg | 1 |
| gained | The Beano | 2017 | 3868 | 1669063 |  | comicvine/the-beano/vol-26847/580854-issue-3868.jpg | 1 |
| gained | Venom | 2023 | 24 (224) | 2564705 |  | comicvine/venom/vol-140084/1010056-see-latveria-and-die.jpg | 1 |
| gained | The Beano |  | 4201 | 2585643 |  | comicvine/the-beano/vol-26847/1049644-issue-4201.jpg | 1 |
| gained | The Beano | 2024 | 4224 | 2611649 |  | comicvine/the-beano/vol-26847/1049621-issue-4224.jpg | 1 |

## Errors

| Series | Year | Issue | GCD ID | Error |
|---|---:|---|---:|---|
