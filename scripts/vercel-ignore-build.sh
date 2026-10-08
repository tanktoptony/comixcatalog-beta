#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 = skip this deployment, exit 1 = build it.
#
# The hourly cover ingest commits its ledgers to main, and each push used to
# trigger a full production deploy: about 24 a day, each keeping its own
# copy of the server bundle and filling Vercel's 10 GB Hobby function storage
# (2026-10-03). This skips commits that only touch files the site never
# reads: bot ledgers and cursors, reports, docs, the video workspace and CI
# config. Anything else, or any doubt (no base commit in the shallow clone),
# builds. 2026-10-08: added gcd-*-cursor.json and comicvine_api_output/ after
# 33 bot data commits in one week still triggered full production deploys,
# each throwing away the cached pages.
set -u
# Preview deployments (every push to a PR branch) are skipped (2026-10-08).
# PR CI already runs `npm run build`, so a preview build only re-checks the
# same compile while costing Vercel build minutes and deployment storage.
# Production (main) builds still go through the file check below.
if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Preview deployment (VERCEL_ENV=${VERCEL_ENV:-unset}); skipping. PR CI builds the branch."
  exit 0
fi
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$BASE" ] || BASE="HEAD^"
if ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  echo "Base commit ${BASE} not in this clone; building."
  exit 1
fi
CHANGED="$(git diff --name-only "$BASE" HEAD)" || { echo "git diff failed; building."; exit 1; }
if [ -z "$CHANGED" ]; then
  echo "No file changes since ${BASE}; building (manual redeploy)."
  exit 1
fi
SITE="$(printf '%s\n' "$CHANGED" | grep -v -E '^(\.ingest-done\.json|needs_volume_id\.json|gap-[a-z-]+\.json|gcd-[a-z-]+-cursor\.json|comicvine_api_output/|scripts/\.instagram-[a-z-]+\.json|reports/|docs/|video-production/|\.github/|[^/]+\.md$)')"
if [ -z "$SITE" ]; then
  echo "Only non-site files changed since ${BASE}; skipping the build:"
  printf '%s\n' "$CHANGED" | head -20
  exit 0
fi
echo "Site files changed since ${BASE}; building:"
printf '%s\n' "$SITE" | head -20
exit 1
