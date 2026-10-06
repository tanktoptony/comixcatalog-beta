# Catalog gap audit, 2026-10-06

Read-only audit of GCD series the app can't show, run against production. Scope: US-market publishers (gcd_publishers.country = us, or name in `US_PUBLISHER_ALLOWLIST`), series that began 2015 or later. Script: kept outside the repo; method below.

## Result

- **89 of 11,725 series (0.8%)** can't be shown. Every one is missing **both** a `series` row and any `gcd_issues`: the GCD series record was synced, its issues never were, and no series row was created.
- No series has a row but no issues (0), and none has issues but no row (0). It's one failure, not two.
- It skews recent: by start year, 2015: 2, 2016: 2, 2017: 2, 2018: 3, 2019: 5, 2020: 2, 2021: 11, 2022: 6, 2023: 13, 2024: 22, 2025: 21.
- Top publishers in the gap: Viz 12, Civics for All 9, DC 6, Blood Moon Comics 6, Aloha Comics / ParaBooks 5, Andrews McMeel 5, Ablaze Publishing 5, Albatross 2.
- Includes a 2025 **Batman** (gcd 224468). Immortal Legend Batman (226482) was the same case; it was fixed by hand on 2026-10-06 (21 issues pulled with `refreshGcdIssuesFromApi.js --gcd-ids=226482`, series row inserted) before this run, so it isn't listed.

**Not measured:** GCD series our `gcd_series` mirror doesn't have at all (invisible to this audit), and series that exist but are missing *recent* issues (the Absolute Superman case in `docs/gcd-incremental-sync-plan.md`).

## Second finding: `gcd_publishers` names are stale for many IDs

Across all 209,399 `gcd_series`: **24,670** point to a `publisher_gcd_id` with no `gcd_publishers` row, and **39,386** point to a publisher whose years don't fit the series (ended before it began, or began well after).

Checked against GCD's live API (comics.org/api), 2026-10-06:

| gcd_series | Our `publisher_gcd_id` | Live GCD agrees? | Our `gcd_publishers.name` | Live GCD name |
|---|---:|---|---|---|
| 81844 The Squidder | 1977 | yes | Kiddie Kapers Co. | **IDW** (us) |
| 4136 Green Arrow | 621 | yes | Crusade Comics | **Play Press** (it) |
| (DC) | 54 | n/a | DC | DC (us), synced today |

So the **series → publisher IDs are right**; the **publisher table has wrong names on unsynced rows**. `docs/CATALOG_DATA.md` says `gcd_series.publisher_gcd_id has wrong links`; that diagnosis is the wrong way round. #211 re-synced some publishers today (`synced_at` set, DC correct); rows it didn't reach (`synced_at` null, ~7,600 with no country) still carry stale names. This affects anything that reads `gcd_publishers` by ID: the `us_market` flag (migration 0037), publisher labels, and pre-2000 publisher resolution.

**Caveat:** both counts use our own `gcd_publishers` names and years, so they measure how far the stale rows reach, not proven bad links. The gap audit's US-market scope reads the same table, so the 89 above may be an **undercount** (a US series whose publisher row is stale can fall outside the scope).

Examples of suspicious links (series ≥ 1990):

- Angel Dark (1990) gcd 4058 -> Gilbert Publishing (2007-2007)
- Superman og Fredsbomben (1990) gcd 4060 -> Genuine Comics (2015-)
- ElfQuest: Kings of the Broken Wheel (1990) gcd 4067 -> Marvel Worldwide Inc. (2005-)
- M (1990) gcd 4068 -> Windjammer (1995-1995)
- Steed and Mrs. Peel (1990) gcd 4069 -> Wells & Clark (1994-1997)
- Will Eisner Presents (1990) gcd 4071 -> Windjammer (1995-1995)
- Son of Mutant World (1990) gcd 4102 -> Krupp Comic Works (1970-1981)
- Superfan 1999 (1990) gcd 4116 -> Green Door Studios (2002-)
- Nuke II: Another Book of Cartoons (1990) gcd 4117 -> Artisan Entertainment (1998-1998)
- Judge Dredd: Bad Science (1990) gcd 4124 -> The Matrix Graphic Series (1984-1986)
- Judge Dredd: Future Crime (1990) gcd 4125 -> The Matrix Graphic Series (1984-1986)
- Green Arrow (1990) gcd 4136 -> Crusade Comics (1993-2009)

## The 89 series

| gcd_id | Series | Publisher | Began | Format |
|---:|---|---|---:|---|
| 222676 | 27 Run Crash | Battle Quest Comics | 2025 |  |
| 226732 | Adventures of Superman: The Book of El | DC | 2025 |  |
| 222803 | Ask and You Will Receive | Viz | 2025 |  |
| 224468 | Batman | DC | 2025 |  |
| 224126 | Cosmos | Viz | 2025 |  |
| 219884 | Djinn Hunter Deluxe | Blackbox Comics | 2025 |  |
| 224877 | Girl Crush | Viz | 2025 |  |
| 226258 | Justice League Red | DC | 2025 |  |
| 222964 | Kaiju No. 8: B-Side | Viz | 2025 |  |
| 224619 | Kill Blue | Viz | 2025 |  |
| 219872 | Mack Moon and the P.E.T.S. | Andrews McMeel | 2025 |  |
| 219873 | Mack Moon and the P.E.T.S. | Andrews McMeel | 2025 |  |
| 219875 | Memoirs From the 20th Century | Blood Moon Comics | 2025 |  |
| 224001 | Not So Shoujo Love Story | Viz | 2025 |  |
| 226699 | Nue�s Exorcist | Viz | 2025 |  |
| 222960 | Pink Candy Kiss | Viz | 2025 |  |
| 224810 | Pink Heart Jam Beat | Viz | 2025 |  |
| 224005 | Snow Angel | Viz | 2025 |  |
| 224676 | The Bugle Call: Song of War | Viz | 2025 |  |
| 223025 | The Climber | Viz | 2025 |  |
| 223172 | Valiant Universe | Alien Books | 2025 |  |
| 219871 | Afro Unicorn | Andrews McMeel | 2024 |  |
| 218988 | Black Sands: The First Pharaoh | Black Sands Entertainment | 2024 |  |
| 216126 | Bro-D Can't Be Broken | Band of Bards | 2024 |  |
| 215135 | Godslap | Bad Egg | 2024 |  |
| 218651 | Happyland | Ablaze Publishing | 2024 |  |
| 214150 | Headsman | Blood Moon Comics | 2024 |  |
| 222674 | Heaven Official's Blessing | Aloha Comics / ParaBooks | 2024 |  |
| 214510 | Here U Are | Aloha Comics / ParaBooks | 2024 |  |
| 213001 | Humbaba | Blood Moon Comics | 2024 |  |
| 217740 | Hungry Heart | Andrews McMeel | 2024 |  |
| 216406 | Ignis Quadrant | Band of Bards | 2024 |  |
| 216403 | Irving: The Evil Wizard | Aloha Comics / ParaBooks | 2024 |  |
| 218993 | Lion's Game | Black Sands Entertainment | 2024 |  |
| 214144 | Night Stalker | Devil's Due / 1First Comics | 2024 |  |
| 214507 | Nirvana in Fire | Aloha Comics / ParaBooks | 2024 |  |
| 217299 | Primer: Clashing Colors | DC | 2024 |  |
| 218979 | Silent Night Deadly Night | American Mythology Productions | 2024 |  |
| 217741 | Spellslinger | Blood Moon Comics | 2024 |  |
| 217387 | Starring Sonya Devereaux: Combat Nurse | American Mythology Productions | 2024 |  |
| 214152 | The Land Left Behind | Blood Moon Comics | 2024 |  |
| 226077 | Xenogeist | Bad Bug Media | 2024 |  |
| 216123 | Zips and Eeloo | Andrews McMeel | 2024 |  |
| 205026 | A Splatter Western One-Shot | Dead Sky Publishing | 2023 |  |
| 202463 | Blue Sultan | Apex Comics Group | 2023 |  |
| 218650 | Centaurs | Ablaze Publishing | 2023 |  |
| 211047 | Dead Detective | Blackbox Comics | 2023 |  |
| 218646 | Get Schooled | Ablaze Publishing | 2023 |  |
| 214151 | Hexpaw: Left Paw of Devil | Blood Moon Comics | 2023 |  |
| 211962 | Historias de resistencia | Civics for All | 2023 |  |
| 218647 | Immortal Regis Omnibus | Ablaze Publishing | 2023 |  |
| 212044 | Jali: Literature of Africa and the Diaspora | Civics for All | 2023 |  |
| 212076 | Lukasa: History of Africa and the Diaspora | Civics for All | 2023 |  |
| 218649 | Savage Garden Omnibus | Ablaze Publishing | 2023 |  |
| 212075 | The Graphic History of Hip Hop | Civics for All | 2023 |  |
| 202464 | The Outer Space Men | Apex Comics Group | 2023 |  |
| 211926 | Barrier Breakers | Civics for All | 2022 |  |
| 215066 | Do You See What I See | Augmented Liberty | 2022 |  |
| 200885 | Florida Man | Big Studios | 2022 |  |
| 185100 | Miss Butterworth and the Mad Baron | Avon | 2022 |  |
| 181671 | Mother Russia Winter Special | Clover Press | 2022 |  |
| 214512 | My Student Spirit | Aloha Comics / ParaBooks | 2022 |  |
| 212045 | Any Questions? | Civics for All | 2021 |  |
| 166578 | Blackest Night Brightest Day Box Set | DC | 2021 |  |
| 183576 | BugHouse | Cat-Head Comics | 2021 |  |
| 174303 | Earth One Box Set | DC | 2021 |  |
| 179332 | God of War: Fallen God | Dark Horse | 2021 |  |
| 183228 | Patriotika | Antarctic Press | 2021 |  |
| 169599 | Political Power: President Joe Biden | Bluewater / StormFront / Storm / TidalWave | 2021 |  |
| 211963 | Recognized | Civics for All | 2021 |  |
| 185576 | Star Runner Chronicles: Fallen Star | Atlantis Studios | 2021 |  |
| 183351 | Swords of Cerebus in Hell? | Aardvark-Vanaheim | 2021 |  |
| 177297 | The Resistance: Uprising | AWA Studios [Artists Writers & Artisans] | 2021 |  |
| 163393 | Amalgama: Space Zombie: The Galaxy's Most Wanted | Action Lab Comics | 2020 |  |
| 169598 | Female Force: Kamala Harris Hardcover Edition | Bluewater / StormFront / Storm / TidalWave | 2020 |  |
| 211895 | Action Activists | Civics for All | 2019 |  |
| 150143 | Anne Bonnie One-Shot | Blue Juice | 2019 |  |
| 192336 | Mezo | A Wave Blue World | 2019 |  |
| 211911 | Registered | Civics for All | 2019 |  |
| 187963 | Trout: Bits & Bobs | Dark Horse | 2019 |  |
| 136035 | Galaktikon | Albatross | 2018 |  |
| 128693 | Hillbilly | Albatross | 2018 |  |
| 132815 | Mark Twain�s Niagara | Alternate History Comics Inc. | 2018 |  |
| 116799 | Life, Death & Sorcery | Chapterhouse Comics Group | 2017 |  |
| 197487 | The Changeling | AyeDee Studio | 2017 |  |
| 154911 | Calypso's Song | Action Bunny Comix | 2016 |  |
| 117724 | Mercy Sparx: Year One | Devil's Due Publishing | 2016 |  |
| 140163 | Godkiller: Walk Among Us | Black Mask Studios | 2015 |  |
| 129457 | Planet Gigantic | Action Lab Comics | 2015 |  |

## Method

Keyset reads of `gcd_publishers`, `gcd_series` (209,399) and `series` (207,559 with gcd_id); `gcd_issues` counted per target series in chunks of 100. ~2 minutes, read-only, service role. Publisher check: a link is suspicious when the publisher ended more than a year before the series began, or began more than a year after.
