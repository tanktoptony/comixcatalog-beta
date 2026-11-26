#!/usr/bin/env bash
set -u

strategy_option=""
if [ "${1:-}" = "--strategy-option" ]; then
  strategy_option="${2:-}"
  shift 2
fi

# npm install configures core.hooksPath for fresh runners through the prepare
# script. Keep ordinary git commands here so configured .githooks run; never
# add --no-verify to this retry path.
for attempt in 1 2 3 4 5; do
  if [ -n "$strategy_option" ]; then
    git pull --rebase -X "$strategy_option" "$@"
  else
    git pull --rebase "$@"
  fi
  pull_status=$?

  if [ "$pull_status" -ne 0 ]; then
    rebase_merge="$(git rev-parse --git-path rebase-merge 2>/dev/null || true)"
    rebase_apply="$(git rev-parse --git-path rebase-apply 2>/dev/null || true)"
    if { [ -n "$rebase_merge" ] && [ -d "$rebase_merge" ]; } ||
       { [ -n "$rebase_apply" ] && [ -d "$rebase_apply" ]; }; then
      echo "::error::Rebase conflict detected. Resolve the conflict instead of retrying the push."
      git rebase --abort 2>/dev/null || true
      exit 1
    fi
  elif git push; then
      exit 0
  fi

  if [ "$attempt" -eq 5 ]; then
    echo "::error::Pull or push failed after 5 attempts."
    exit 1
  fi

  echo "Pull or push failed on attempt $attempt; retrying shortly."
  sleep $((attempt * 2))
done
