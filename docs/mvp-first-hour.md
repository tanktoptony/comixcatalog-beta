# MVP: the first hour a new member spends

**Status:** active, through 2026-12-31 (MVP mode: fixes only, no new features)
**Last walked:** 2026-11-03 evening Chicago time (2026-11-04 UTC), live site and a local dev server

The goal is that every step below works on a phone and a laptop with no open blocker or confusing snag.

## How it was walked

- Chrome through Playwright at 390x844 (phone, touch) and 1440x900 (desktop), signed out and signed in, against live data.
- Signed-in checks used `test_tony` and `test_tony_depaul`, with a session from an admin magic link. No password was touched.
- Anything added to `test_tony_depaul` during a test was removed by row id afterward, and the row count checked against the start.
- No real signup was created. Signup-flow checks ran on a local dev server with Supabase `signUp` and the founding POST answered in the browser. The real status and confirm routes were exercised with temporary token rows for `test_tony_depaul`, which were removed, and that account is still not a founder.
- Load times are from this machine with no throttling unless marked Lighthouse.

Severity: **blocker** stops the step, **confusing** the step works but a new member can miss it or be misled, **cosmetic** looks off but costs nothing.

## Snags

| # | Step | Device | What happened | Severity | Load | Status |
|---|---|---|---|---|---|---|
| 1 | Sign up, founding pass | Both | The page after signup shows "Check your email", and the onboarding modal covers it 0.8 s later. The modal's big button, "Open search", leaves the page for good. | Blocker | 0.3 s | Fix in `agent/mvp-founding-pass` |
| 2 | Sign up, founding pass | Both | "Check your email" appears once, in the browser that signed up. Nothing repeats it. One Nov 3 member signed up in the Android Instagram in-app browser, signed in from Chrome 56 seconds later, added a book, and was still active 5 hours on with no pass. The site banner hid for all signed-in members. | Blocker | n/a | Fix in `agent/mvp-founding-pass`: the banner now reminds signed-in members who have no pass |
| 3 | Sign up, founding pass | Both | Signups with `?next=` (series, scan, /switch, issue, /start) land on that page and never see the check-your-email line. | Blocker | n/a | Same fix as 2 |
| 4 | Sign up, founding pass | Both | With a confirm link already out, the page still offers "Claim pass No. 038" above the message, so it reads as nothing happened. It doubled as the only resend, unlabeled. | Confusing | n/a | Fix in `agent/mvp-founding-pass`: "One more step" panel, the address, "Send it again" |
| 5 | Confirm email | Phone mostly | The link opens in a browser with no session (the mail app's, or anything but Instagram's in-app one). The page said "You're in" under a "Claim your pass, free" button pointing at /signup. | Confusing | n/a | Fix in `agent/mvp-founding-pass`: done state with a log-in link |
| 6 | Confirm email | Both | A second click on a good link, or a mail scanner clicking first, said "expired or already used, claim again" to someone who holds the pass. | Confusing | n/a | Fix in `agent/mvp-founding-pass` |
| 7 | Confirm email | Both | Replies to the email bounce: it comes from hello@comixcatalog.com, signed by Tony, and the apex domain has no MX. | Confusing | n/a | Fix in `agent/mvp-founding-pass`: reply-to is comixcatalog@gmail.com |
| 8 | Confirm email | Both | After 5 sends the error was a dead end with no way forward. | Cosmetic | n/a | Fix in `agent/mvp-founding-pass`: gives the address to write to |
| 9 | First books, after signup | Both | The onboarding modal also opens over /scan, /switch, series and issue pages for an empty library, on top of what the member came to do. | Confusing | n/a | Fix in `agent/mvp-founding-pass`: held on those pages while the library is empty |
| 10 | First books, Mark what you own | Both | "Add issues I own" jumps past the marking tools to the grid with marking off. The toolbar ends up just above the screen (y = -73), so the range tool the Nov 10 carousel promises can't be seen. | Confusing | 0.4 to 1.4 s | Fix in `agent/mvp-carousel-fixes` |
| 11 | First books, Mark what you own | Both | `?own=1`, where the empty library and signup send a new member, lands at the top of the page with the tools 1,331 px down on a phone and 1,088 px on desktop, and nothing pointing at them. | Confusing | 0.4 to 1.4 s | Fix in `agent/mvp-carousel-fixes` |
| 12 | First books, /switch | Both | **X-Men (1991) #1 can't import.** GCD writes it "1 [Cover A]", the resolver doesn't see that form, and the pick list offers only two foreign reprints (Princessa 1990, Semic 1992). Any bracketed issue number has this problem. | Blocker for those books | 0.8 to 1.2 s | Fix in `agent/mvp-carousel-fixes` |
| 13 | First books, /switch | Both | **Text grades in slash or plus form are lost.** "VF/NM" saved no grade at all, and the done screen still counted it in "4 grades". The carousel promises grades come with the import. | Confusing | n/a | Fix in `agent/mvp-carousel-fixes`: half grades take the named grade they start from, and anything unplaceable goes in the notes |
| 14 | First books, /switch | Both | A cert number with no grading company in the row is dropped. | Cosmetic | n/a | Open, low priority |
| 15 | First books, search | Phone | On the search card, some format tiles (TPB, HC) have an empty dark thumbnail. | Cosmetic | 1.4 s | Open |
| 16 | First books, series page | Both | Range marking only reaches the 60 issues on screen. On a long run, the far end of a range needs "Show all issues" first, and nothing says so. | Confusing | n/a | Open |
| 17 | Sign up, /signup | Both | Dev console: the "Log in" link on `/signup?next=` differs between server and client (attribute mismatch). The click still carries `next`. | Cosmetic | 0.2 s | Open |
| 18 | Onboarding modal copy | Both | Step 3 says "Set your username" (already set at signup), "works like Discogs for comics" (retired pitch, NORTH_STAR 1.2) and "get verified". Needs a fact check. | Cosmetic | n/a | Open |
| 19 | Anti-abuse note | n/a | pokemail.net is a throwaway domain missing from the disposable list, so it can claim a pass. | Note for Tony | n/a | Open question |
| 20 | Speed, see below | Phone | Home, series, issue, library and signed-in home are all over 4 s LCP on Lighthouse mobile or the same throttling. | Confusing (brief's rule) | see below | Open |

## Checked and working

- Arrive: `/ig`, `/yt` and `/s/SHOP` all redirect to the founding page with their tags, in 0.3 to 0.4 s, no console errors, no sideways scroll on either width. Home, series, issue, /start, /scan and /switch also clean signed out. `/library` signed out goes to `/login?next=/library`.
- Typo-forgiving search, 12 of 12 reached the right series: spiderman, amazng spider man, batmn, savge dragon, xmen 1, incredable hulk, wolverine origins, uncany x-men, amory wars, absolut batman, teenage mutant ninja turtels, sandmn. 0.5 to 1.2 s.
- Cover scan, live, phone: real Amazing Fantasy #15 cover matched in 5.6 s and added. Offers the 2002 and 2006 reprints under "Swap match".
- Stack scan, live, phone: 2 covers identified in 5.7 s, "Add 2 books" added both.
- Mark what you own with a range, live, both widths: issue 3 to issue 7 gave "Add 5 to your collection", saved 5 rows in 1.3 to 1.5 s, cards showed Owned, and the First Key badge toast fired.
- /switch with a CLZ-shaped file, live, both widths: grades 9.8, 9.4 and 9.6, CGC and CBCS slabs, cert numbers and prices paid all saved on the right rows. Unknown title went to "Not in our catalog yet" with a request button.
- Signed-in pages load clean on both widths: home (Your shelf), library, wantlist, pull list, series, issue, /switch, /scan, /people, /account, founding page.
- Sender domain: SPF, DKIM and DMARC records are in place for the founding email. 3 of the 5 Nov 3 signups clicked it, so it does deliver.

## Not exercised yet

- Barcode scan with a camera (the tab and its code were read, not run on a fake camera this pass).
- League of Comic Geeks and plain spreadsheet exports (only the CLZ-shaped file ran).
- Value, runs and missing issues on a full library, follows, activation nudge emails (read, not sent).
- A real inbox: the Resend key is send-only, so delivery to the 2 unclaimed Nov 3 members can't be read from here. The Resend dashboard shows it.
- Google sign-in end to end, see below.

## Speed

Lighthouse 12, mobile, default simulated throttling, live site, 2026-11-04 UTC:

| Page | LCP | FCP | TBT | Perf score |
|---|---|---|---|---|
| Home `/` | 8.2 s | 2.3 s | 920 ms | 50 |
| Series (Saga, 72 issues) | 6.6 s | 1.6 s | 1,520 ms | 50 |
| Series (Amazing Spider-Man, 650 issues) | 7.1 s | 1.9 s | 2,240 ms | 45 |
| Issue (Amazing Fantasy #15) | 5.1 s | 1.6 s | 1,420 ms | 55 |
| /switch | 1.8 s | 1.4 s | 1,500 ms | 74 |
| /founding-collectors | 2.0 s | 1.5 s | 1,660 ms | 70 |

Signed in, same phone-level throttling set by hand (1.6 Mbps, 150 ms latency, CPU 4x), since Lighthouse can't hold this site's localStorage session: library 4.8 s LCP, signed-in home 8.0 s LCP.

Server response is 50 to 350 ms on all of them, so these are front-end costs: images and JavaScript. Over the 4 s line: home, both series pages, issue, library, signed-in home. Not fixed yet. The machine was under heavy load from other jobs during the run, though Lighthouse's simulated numbers mostly correct for that, so re-measure once before and after any fix. Issue-page caching and SEO belong to the Search workstream; LCP image priority on these pages is first-hour work.

What Lighthouse says holds them up, for whoever picks this up:

- Home: the LCP element is the hero H1, text and no image, so the wait is JavaScript and fonts. 1,973 KiB total, 7.8 s main-thread work, a 2.8 s long document task.
- Series: the LCP is `img.series-cover-back`, which Lighthouse flags as lazy-loaded and without fetchpriority. Making the visible hero covers eager with fetchpriority=high is the cheap first step.
- Issue: the LCP is `img.issue-cover-img`, discoverable and eager but without fetchpriority.
- Everywhere: Google Analytics costs about 0.9 to 1.0 s of script time on these runs, and TBT is 0.9 to 2.2 s.

## Google sign-in

Hidden on /login and /signup since June 16. What's known on Nov 3:

- The old cause is gone. `src/app/auth/callback/route.js` no longer exists; `page.js` runs the exchange in the browser's own client (PR #78, Sept 13). No Google sign-in has been tested since.
- The provider is on: `/auth/v1/settings` reports `google: true`, and `/auth/v1/authorize` redirects to Google.
- Google signups skip the confirm email and get the pass right away (`/api/founding/status` POST), which would remove the pass snag for anyone using it.
- Google refuses sign-in inside embedded browsers such as Instagram's (`disallowed_useragent`), and Instagram is where signups came from on Nov 3, so the email form has to stay the first option and in-app browser users need to not hit a dead end.
- Still unproven: a real end-to-end run on a phone and a laptop. Needs a real Google account in a real browser, and creating a Google account signup on production would claim a pass. Open question for Tony.
