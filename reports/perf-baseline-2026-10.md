# Speed baseline, October 2026

The "before" numbers for the slop-remediation speed work. Every speed PR re-runs `npm run perf:baseline` with the same cases (`scripts/perfBaseline.js`) and compares against this file.

Time is to the last byte of the response, measured from Tony's machine against production with the CDN bypassed (cache-busting query param plus no-cache headers; the CDN hits column confirms 0). Requests run one at a time, and one warm-up request per endpoint is thrown away first so a cold serverless start isn't counted.

**Targets (Tony, 2026-10-05):** p95 at or under 1.5s for every endpoint, and at or under 0.8s for search.

## Against the targets

| Endpoint | p50 (A / B) | p95 (A / B) | Target | Verdict |
|---|--:|--:|--:|---|
| Issue pages (3 cases) | 409–447ms | 0.47–0.73s | 1.5s | Meets |
| Series pages (2 cases) | 296–361ms | 0.34–0.50s | 1.5s | Meets |
| Search: batman | 340 / 329ms | 0.51 / 0.40s | 0.8s | Meets |
| Search: x-o (short query) | 713 / 707ms | 1.17 / 2.77s | 0.8s | **Misses**: typical is close to target, the slow end isn't, and one request took 10s |
| Search: sandman | 242 / 232ms | 0.35 / 0.30s | 0.8s | Meets |
| Library load (500 issues) | 362 / 390ms | 0.49 / 0.58s | 1.5s | Meets |
| Public profile (356 books) | 1.58 / 1.69s | 2.08 / 2.17s | 1.5s | **Misses on every request**, typical included |
| Marketplace | 154 / 168ms | 0.18 / 0.28s | 1.5s | Meets |

**Where the speed work should go:** the public profile route, and short search queries. Everything else already meets target with room to spare, so the other WS7 items (issue/series query batching, CDN headers, marketplace refresh) only ship if they move a number here.

## Notes

- **Cold starts are real and not in these numbers.** Before the warm-up was added, a single cold request saw issue 2.8s, x-o search 18s, library 3.8s, and two earlier 20-run passes that counted the first request had p95s up to 6s on the profile and 11s on x-o. First visitors after a quiet spell feel that. Run with `--cold` to measure it.
- **p95 at 20 samples is noisy**: it's close to the second-slowest request. Treat a p95 change smaller than the A/B spread as noise; the p50s agree within about 10%.
- **The public profile returned a 500 once** during the cold smoke test; the same request succeeded right after, and every request since has succeeded. Intermittent; watch for it when that route is worked on.
- **`cover_variants` hit a statement timeout** on a simple 1,000-row read ordered by `id` while choosing these cases. Not one of these endpoints, but noted for WS7.
- Search responses are about 0.4 KB because the search page asks for a small first page; this matches how the site calls it.

## Run A

Base: https://www.comixcatalog.com · 20 sequential runs per endpoint · 1 warm-up request discarded per endpoint · started 2026-10-05T14:16:39.075Z

| Endpoint | n | p50 | p95 | max | errors | CDN hits | size |
|---|--:|--:|--:|--:|--:|--:|--:|
| issue: Absolute Batman #1 (2024, 44 printings) | 20 | 423ms | 498ms | 499ms | 0 | 0 | 0.8 KB |
| issue: Amazing Spider-Man #1 (1963) | 20 | 420ms | 512ms | 658ms | 0 | 0 | 0.8 KB |
| issue: Amazing Spider-Man #300 (1988, newsstand twin) | 20 | 427ms | 725ms | 860ms | 0 | 0 | 1.4 KB |
| series: Amazing Spider-Man (1963, 650 issues) | 20 | 361ms | 474ms | 912ms | 0 | 0 | 176.0 KB |
| series: 28 Days Later (2010, 6 issues) | 20 | 309ms | 400ms | 449ms | 0 | 0 | 1.0 KB |
| search: batman | 20 | 340ms | 514ms | 591ms | 0 | 0 | 0.4 KB |
| search: x-o | 20 | 713ms | 1.17s | 1.94s | 0 | 0 | 0.4 KB |
| search: sandman | 20 | 242ms | 351ms | 567ms | 0 | 0 | 0.4 KB |
| library-hydrate: 500 ids | 20 | 362ms | 491ms | 509ms | 0 | 0 | 274.6 KB |
| public-profile: thrice347 | 20 | 1.58s | 2.08s | 2.57s | 0 | 0 | 324.8 KB |
| marketplace | 20 | 154ms | 182ms | 553ms | 0 | 0 | 243.6 KB |

## Run B

Base: https://www.comixcatalog.com · 20 sequential runs per endpoint · 1 warm-up request discarded per endpoint · started 2026-10-05T14:18:59.037Z

| Endpoint | n | p50 | p95 | max | errors | CDN hits | size |
|---|--:|--:|--:|--:|--:|--:|--:|
| issue: Absolute Batman #1 (2024, 44 printings) | 20 | 411ms | 481ms | 549ms | 0 | 0 | 0.8 KB |
| issue: Amazing Spider-Man #1 (1963) | 20 | 447ms | 501ms | 620ms | 0 | 0 | 0.8 KB |
| issue: Amazing Spider-Man #300 (1988, newsstand twin) | 20 | 409ms | 471ms | 487ms | 0 | 0 | 1.4 KB |
| series: Amazing Spider-Man (1963, 650 issues) | 20 | 354ms | 502ms | 583ms | 0 | 0 | 176.0 KB |
| series: 28 Days Later (2010, 6 issues) | 20 | 296ms | 339ms | 358ms | 0 | 0 | 1.0 KB |
| search: batman | 20 | 329ms | 396ms | 578ms | 0 | 0 | 0.4 KB |
| search: x-o | 20 | 707ms | 2.77s | 10.11s | 0 | 0 | 0.4 KB |
| search: sandman | 20 | 232ms | 298ms | 309ms | 0 | 0 | 0.4 KB |
| library-hydrate: 500 ids | 20 | 390ms | 583ms | 631ms | 0 | 0 | 274.6 KB |
| public-profile: thrice347 | 20 | 1.69s | 2.17s | 2.72s | 0 | 0 | 324.8 KB |
| marketplace | 20 | 168ms | 275ms | 283ms | 0 | 0 | 243.6 KB |
