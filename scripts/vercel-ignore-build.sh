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
# builds.
set -u
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
SITE="$(printf '%s\n' "$CHANGED" | grep -v -E '^(\.ingest-done\.json|needs_volume_id\.json|gap-[a-z-]+\.json|gcd-refresh-cursor\.json|scripts/\.instagram-[a-z-]+\.json|reports/|docs/|video-production/|\.github/|[^/]+\.md$)')"
if [ -z "$SITE" ]; then
  echo "Only non-site files changed since ${BASE}; skipping the build:"
  printf '%s\n' "$CHANGED" | head -20
  exit 0
fi
echo "Site files changed since ${BASE}; building:"
printf '%s\n' "$SITE" | head -20
exit 1
