# Instagram Auto-Post Bot — Implementation Plan

**Goal:** Daily auto-generated Instagram post — cover art + value/grade info pulled from ComixCatalog's own catalog — via the real Instagram Graph API. No manual content creation once it's running.

**Status (2026-08-01):** Planning. Two tracks, one blocking the other:
- **Track 1 (you, today):** Meta/Instagram account setup — nobody else can do this part.
- **Track 2 (agent, can start immediately):** all the code — doesn't need real credentials until the final test-post step.

---

## Track 1 — Account setup (do this first, ~20-30 min)

1. **Convert the Instagram account to a Professional account** (Business or Creator) — Instagram app → Settings → Account type → switch to Professional. Personal accounts cannot use the Graph API at all.
2. **Link it to a Facebook Page.** If comixcatalog doesn't have one yet, create a minimal one — it's just a technical requirement, doesn't need to be actively used. Instagram app → Settings → linked accounts → Facebook.
3. **Create a Meta Developer App:** go to [developers.facebook.com](https://developers.facebook.com) → My Apps → Create App → type "Business." Add the **Instagram Graph API** product to it.
4. **Add your own Instagram account as an "Instagram Tester"** under the app's Roles settings, then accept the tester invite from within the Instagram app itself (Settings → Apps and Websites → Tester Invites). This is the step that lets you skip Meta's App Review — Development Mode apps can act on accounts explicitly added as testers without review.
5. **Generate a long-lived access token** via the Graph API Explorer (developers.facebook.com/tools/explorer): select your app, select the Page, request `instagram_basic` + `instagram_content_publish` + `pages_show_list` + `pages_read_engagement` permissions, generate a token, then exchange it for a long-lived one (60 days) via the `/oauth/access_token?grant_type=fb_exchange_token` endpoint — Meta's docs have the exact curl command.
6. **Get the Instagram Business Account ID:** `GET /me/accounts` (find your Page) → `GET /{page-id}?fields=instagram_business_account`.

You'll end up with two values — add them to `.env.local` and to Vercel:
```
INSTAGRAM_BUSINESS_ACCOUNT_ID=...
INSTAGRAM_ACCESS_TOKEN=...
```

**Known limitation:** the 60-day token expires and needs manual (or scripted) refresh. Fine for v1 — flag it as a recurring task, not a blocker.

---

## Track 2 — The bot itself

### Content selection (`scripts/generateInstagramPost.js`)

Rotate through three post types so it doesn't feel repetitive:

1. **"Cover Spotlight"** — random pick from the existing curated `src/lib/featuredSeries.js` list (~79 entries, already vetted for quality — reuse it, don't rebuild a taste model).
2. **"New to the Catalog"** — the most recently added `canonical_covers` row from the ingest pipeline. Nice side effect: this visibly shows the catalog growing and ties marketing directly to the cover-completion work.
3. **"Key Issue Value Check"** — an issue with a real `auto_market_value` (prefer `confidence: high` once §2c's confidence scoring exists; for now, prefer rows with `auto_market_value_n >= 3`).

For each: resolve the canonical cover's public storage URL (already public — `canonical-covers` bucket), issue title/number/year/publisher, and value if available.

### Caption template

```
{Series Title} #{Issue Number} ({Year})
{Publisher}
{Optional: key-fact line, if the issue is in a known key-issue list}
{Optional: "Est. value (raw): $X" if auto_market_value present}

Catalogued on ComixCatalog — link in bio
#comics #keyissues #comicbooks #{publisher-hashtag} #{decade}comics
```

Keep it factual, not hypey — matches the brand's own "collector-first, never marketer-first" posture from NORTH_STAR.md. No "🔥 DON'T MISS OUT" energy.

### Posting (`scripts/postToInstagram.js`)

Instagram Graph API is a two-call process:
1. `POST /{ig-user-id}/media` with `image_url` (the public Supabase storage URL) + `caption` → returns a container ID.
2. `POST /{ig-user-id}/media_publish` with that container ID → publishes it.

Both need `INSTAGRAM_ACCESS_TOKEN` as a query param or bearer header — check current Graph API docs for the exact param name (`access_token`) since Meta occasionally shifts auth conventions.

### De-dup ledger

`scripts/.instagram-posted.json` — array of already-posted issue/series IDs, same pattern as the existing `.refresh-cursor` file. Check before selecting; append after a successful publish.

### Automation

New workflow `.github/workflows/instagram-post.yml` — daily cron (pick a time with real engagement, e.g. 17:00 UTC / noon-ish US), calls `node scripts/generateInstagramPost.js | node scripts/postToInstagram.js` (or combine into one script). Needs `INSTAGRAM_BUSINESS_ACCOUNT_ID` + `INSTAGRAM_ACCESS_TOKEN` added as GitHub Actions repo secrets, same as the existing `COMICVINE_API_KEY` pattern.

### Acceptance criteria

- Dry-run mode (`--dry-run`) prints the selected content + caption without posting — verify manually before trusting it live.
- One real live test post, manually reviewed for image/caption quality before enabling the daily cron.
- De-dup ledger prevents reposting the same issue within some cooldown window (start with "never repeat," revisit if the catalog is too small to sustain daily unique posts).

---

## What's explicitly out of scope for v1

- Stories, Reels, or carousel posts — single-image feed posts only.
- Comment/DM auto-replies — pure posting bot, no engagement automation (that's a different, riskier ToS surface).
- Cross-posting to other platforms — Instagram only for now.
- Token auto-refresh automation — manual refresh every ~60 days is fine to start.
