# Episode 003 research and editorial notes

Checked 2026-10-08. Paragraph numbers refer to SCRIPT.md.

## Confirmed by Tony (from the brief): use freely
- COVID-era roommate on Discogs; showed cataloging, pressings, sellers worldwide, deals, approximate values.
- Starting a master's in software engineering at the time.
- Coheed and Cambria comics were the motivating collection.
- Corey gave him two large long boxes, collected since childhood in the '90s, hundreds of comics.
- Mostly bagged and boarded, largely unorganized.
- Mainstream Marvel, DC and Image plus odd indie material.
- Confirmed titles: **Cerebus, Milk & Cheese, Scud: The Disposable Assassin, "obscure Malibu comics,"** plus hard-to-identify books.
- Sorted by series or publisher, added to his ComixCatalog account.
- Mainstream runs were easy ("Wow, I made this"); obscure books exposed data gaps and UX problems.

## Not confirmed: do not say on camera until Tony confirms
- Who Corey is, how they know each other, why he gave the boxes away (P23, P24).
- Any specific mainstream series in the boxes (P29).
- Which Malibu titles (P37).
- Whether Tony personally hit the Cerebus/Malibu search gaps *with Corey's books* (P40). See next section.
- Exact count of comics. The script says "hundreds," the brief's own word. No number.

## Strong lead, needs Tony's confirmation
Tony's phone QA punch list from **2026-09-18** (memory: "Valiant/Malibu coverage gaps") lists books he couldn't find or that had wrong covers: Valiant (Chaos Effect, Armorines, Bloodshot, Deathmate, Ninjak, Shadowman, Rai...), **Scud's whole Fireman Press run and #13**, Mortal Kombat: Battlewave, Star Trek: Generations, Elric, Evil Ernie, **Cerebus ("investigate")**, Goro: Prince of Pain, **Street Fighter (Malibu)**, and **"Malibu Comics generally."** It also notes a real UX problem: several Ninjak runs looked identical in the search dropdown.

That list overlaps the confirmed box contents (Scud, Cerebus, Malibu) almost exactly, and the timing fits. **If those came from Corey's boxes, Tony can name any of them on camera,** and the Ninjak dropdown problem is the perfect P42. If they didn't, leave them out.

## Fact table

| Para | Claim | Status | Source |
|---|---|---|---|
| P18 | Discogs pages per release/pressing; collection button; marketplace | Verified | Discogs (Wikipedia); marketplace launched late 2005 |
| P19 | User-generated database | Verified | Wikipedia; NYT described it as "Wikipedia-like" |
| P20 | Started in 2000 by Kevin Lewandowski (Intel programmer) as a catalog of his own electronic music collection; later expanded to all genres | Verified | Wikipedia, Discogs; VICE interview. The name is in notes, not narration |
| P21 | Variants, reprints, newsstand vs direct, relaunch renumbering | General knowledge | |
| P22 | Claudio Sanchez writes the Coheed comics (The Amory Wars) | Verified, well known | Saved for Episode 004; one line only here |
| P25 | Long box description | General knowledge | No count claim |
| P34 | Cerebus: Dave Sim, Aardvark-Vanaheim, 300 issues, Dec 1977 to Mar 2004, began as a Conan parody | Verified | Wikipedia, Cerebus the Aardvark |
| P34 | "One of the most important self-published comics" | Opinion, widely held | Wikipedia notes it inspired Jeff Smith, Terry Moore and other self-publishers |
| P34 | "Complicated reputation, especially the later issues" | Verified, deliberately vague | Wikipedia documents the criticism of issue #186 and later essays. The script does not repeat it |
| P35 | Milk & Cheese: Evan Dorkin, Slave Labor Graphics, "dairy products gone bad" | Verified | Wikipedia, Milk and Cheese (comics run 1991-1997) |
| P35 | Issue #2 is titled "Other Number One," #3 "Third Number One" | Verified visually | ComicVine covers for Milk and Cheese (SLG, 1991) #2 and #3, in `episode-003-assets/covers` |
| P36 | Scud: Rob Schrab; Fireman Press 1994-1998; stopped at #20 on a cliffhanger; finished as a 4-issue Image series, Feb-May 2008; vending-machine assassins that self-destruct; target hospitalized, Scud pays the bills | Verified | Wikipedia, Scud: The Disposable Assassin. Target's name (Jeff) left out on purpose |
| P37 | Malibu Comics; Ultraverse launched June 1993; Marvel bought Malibu November 1994 | Verified | Wikipedia, Ultraverse; UPI, "Marvel buys Malibu Comics," 1994-11-03 |
| P40 | Cerebus returned nothing in ComixCatalog search until 2026-10-05 | Verified in repo | Commit 178c920 (#210), comment in `src/lib/publisher.js` |
| P40 | Malibu (and Chaos!) excluded from search until 2026-09-17 | Verified in repo | Commit e3894c0; `src/lib/publisher.js` comment says 243 Malibu series rows existed but were filtered out |
| P40 | Milk & Cheese not on the site | Verified live 2026-10-08 | `/api/search/series?q=milk and cheese` and `?q=milk` return no Milk & Cheese series |
| P40 | Scud: only the 2008 Image series (4 issues) | Verified live 2026-10-08 | `/api/search/series?q=scud` returns one series |
| P41 | Cause: a hand-built US publisher allowlist | Verified in repo | `US_PUBLISHER_ALLOWLIST` in `src/lib/publisher.js` ("MVP filter: restrict search surfaces to US publishers"). Slave Labor Graphics and Fireman Press are not on it |
| P45 | Malibu and Cerebus searchable now | Verified live 2026-10-08 | Cerebus: 298-issue series with covers. Malibu: e.g. Firearm (Malibu) appears in search |
| P49 | Marketplace is a beta: offers by message, no checkout, no payouts, no fees | Verified in code 2026-10-08 | `src/app/sell/page.js` |

## Credibility guardrails
- No values, prices, or "what these are worth." None appear in the script.
- No claim that every gap is fixed. P45 says what is fixed and what isn't.
- No number of books in the boxes.
- **Recording-day re-check:** if someone adds Slave Labor Graphics or Fireman Press to the allowlist before recording, P40 and P45 have to change. Run these and adjust:
  - `https://www.comixcatalog.com/api/search/series?q=milk%20and%20cheese`
  - `https://www.comixcatalog.com/api/search/series?q=scud`
  - `https://www.comixcatalog.com/api/search/series?q=cerebus`

## Content notes
- **Cerebus:** the script acknowledges the later-issue controversy in one clause and moves on. Don't show interior pages from the late run. Covers from the early run (Conan-parody era) fit P34 best.
- **Milk & Cheese:** cartoon violence, profanity on some covers. Pick covers that are YouTube-safe.
- **Coheed:** one line in P22 only. Episode 004 owns the subject.

## Open questions for Tony
1. Who is Corey to you? (P23) Does he want to be named and/or on camera? Get his OK before naming him in a published video.
2. Why did he give the boxes away? (P24)
3. Which mainstream series were in there? (P29)
4. Which Malibu titles? (P37)
5. Were the 2026-09-18 punch-list books (Scud, Valiant, Malibu Street Fighter, Mortal Kombat, Evil Ernie, Elric) from Corey's boxes? (P40, P42)
6. Is there a book you still can't identify? (P38)
7. Is Episode 004 locked as Coheed? (P51) An older plan had 004 as 90s Street Fighter.
8. Do you want Slave Labor and Fireman Press added to the allowlist **before** you record? If they're fixed first, the episode can show it working, and P40/P45 change from "still broken" to "fixed after this happened." Either version is honest. This is a site change, so it needs your go-ahead.
