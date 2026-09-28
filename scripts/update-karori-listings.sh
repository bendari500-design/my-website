#!/usr/bin/env bash
# Refresh the Karori sunlight map's listings and deploy them.
#
# Copies the latest listings.geojson from the karori-sun project into
# public/karori-sun/data/, and if it changed: commits ONLY that file, pushes to
# main, waits for the GitHub Pages deploy workflow, then checks the live URL.
#
# Usage: scripts/update-karori-listings.sh
# Env overrides: KARORI_SRC (source geojson path)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${KARORI_SRC:-/workspace/karori-sun/site/data/listings.geojson}"
DEST_REL="public/karori-sun/data/listings.geojson"
DEST="$REPO_DIR/$DEST_REL"
LIVE_URL="https://bendari500-design.github.io/my-website/karori-sun/data/listings.geojson"
WORKFLOW="deploy.yml"

cd "$REPO_DIR"

[[ -f "$SRC" ]] || { echo "Source not found: $SRC" >&2; exit 1; }

branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || { echo "Not on main (on '$branch'); aborting." >&2; exit 1; }

# Stay in sync with origin before committing.
git pull --ff-only --quiet origin main

mkdir -p "$(dirname "$DEST")"
if [[ -f "$DEST" ]] && cmp -s "$SRC" "$DEST"; then
  echo "Listings unchanged; nothing to do."
  exit 0
fi

cp "$SRC" "$DEST"
if git diff --quiet -- "$DEST_REL" && ! git ls-files --others --exclude-standard --error-unmatch "$DEST_REL" >/dev/null 2>&1; then
  echo "Listings unchanged in git; nothing to do."
  exit 0
fi

git add -- "$DEST_REL"
# Commit only the listings file, even if other changes are staged.
git commit --quiet -m "Update Karori listings" -- "$DEST_REL"
sha="$(git rev-parse HEAD)"
echo "Committed $sha; pushing to main..."
git push --quiet origin main

# Find the Pages workflow run for this commit (it can take a few seconds to appear).
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list --workflow "$WORKFLOW" --branch main --commit "$sha" \
    --limit 1 --json databaseId --jq '.[0].databaseId // empty' 2>/dev/null || true)"
  [[ -n "$run_id" ]] && break
  sleep 5
done
[[ -n "$run_id" ]] || { echo "Could not find a $WORKFLOW run for $sha" >&2; exit 1; }

echo "Watching workflow run $run_id..."
gh run watch "$run_id" --exit-status

echo "Checking $LIVE_URL ..."
for _ in $(seq 1 12); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Cache-Control: no-cache' "$LIVE_URL?v=$sha" || true)"
  if [[ "$code" == "200" ]]; then
    echo "Live: $LIVE_URL (HTTP 200)"
    exit 0
  fi
  echo "  got HTTP $code, retrying..."
  sleep 10
done
echo "Live check failed: $LIVE_URL (last HTTP $code)" >&2
exit 1
