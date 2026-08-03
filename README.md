# ComixCatalog

What Discogs is for music, but for comic books — a comic database, collection manager, and (post-launch) peer marketplace. Solo-founder project, built in Chicago.

- **Live:** comixcatalog.com
- **What's actually shipped vs. planned:** see [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) — don't trust marketing copy or older docs for this.
- **Launch target:** August 31 – September 11, 2026. Gates and status: [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).
- **Full engineering brief** (schema, domain vocabulary, data sources, known pitfalls): [CLAUDE.md](CLAUDE.md).

## Tech stack

Next.js (App Router) · Supabase (Postgres) · Stripe · Tailwind CSS · Python ingestion scripts + Node scripts under `scripts/`.

## Local setup

```bash
npm install
npm run dev       # http://localhost:3000
```

You'll need a `.env.local` with Supabase, Stripe, ComicVine, and eBay credentials — see `CLAUDE.md` for which keys are required. **Never commit `.env` or `.env.local`.**

## Useful commands

```bash
npm run lint                # ESLint
npm run test:cover-match    # cover-matching unit tests
npm run build                # production build
npm run covers:weekly       # manual trigger of the weekly cover-cache + gap-regen job
```

Root-level Python scripts (`comicvine_api_to_supabase.py`, etc.) are data-pipeline tools, not part of the Next.js runtime — run manually, not via npm. See `CLAUDE.md` for what each one does.

## Documentation map

| Question | Where |
|---|---|
| What exists right now? | [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) |
| What's blocking launch? | [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md) |
| Schema, domain terms, engineering gotchas | [CLAUDE.md](CLAUDE.md) |
| Where is everything else documented? | [docs/README.md](docs/README.md) — full index and authority order |

## Safety notes

- `.env.local` holds live secrets (Supabase service role key, Stripe live key, eBay, Instagram). Never commit it, never paste it into a shared doc or PR.
- Several scripts under `scripts/` write directly to production data. Check for a `--dry-run` flag before running anything unfamiliar against real data.
