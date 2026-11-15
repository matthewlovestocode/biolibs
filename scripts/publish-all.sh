#!/usr/bin/env bash
# Publish every workspace package to npm in dependency order.
#
# A package's dependencies must exist on the registry before it is published, or `npm install` of it
# fails for the first person who tries. The order below is a topological sort of the @biolibs/* graph,
# recomputed and checked by scripts/publish-order.mjs.
#
#   scripts/publish-all.sh --dry-run    # pack and validate, publish nothing
#   scripts/publish-all.sh              # publish for real
#
# Already-published versions are skipped, so a run that stops halfway can simply be run again.
# Authentication: npm 2FA set to auth-and-writes prompts for a one-time code on every publish, which
# makes 23 of them impractical. Use a granular access token with 2FA bypass, in ~/.npmrc or NPM_TOKEN.
set -euo pipefail

cd "$(dirname "$0")/.."

DRY=""
if [[ "${1:-}" == "--dry-run" ]]; then DRY="--dry-run"; fi

ORDER=$(node scripts/publish-order.mjs)
TOTAL=$(echo "$ORDER" | wc -l | tr -d ' ')

echo "building from a clean tree"
rm -rf packages/*/dist packages/*/tsconfig.tsbuildinfo
npx tsc -b
echo "running the test suite"
npx vitest run --silent >/dev/null
echo "build and tests pass"
echo

i=0
published=0
skipped=0
while read -r name; do
  i=$((i + 1))
  version=$(node -p "require('./packages/${name#@biolibs/}/package.json').version")
  printf '[%2d/%d] %-28s %s' "$i" "$TOTAL" "$name" "$version"

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "  — already published, skipping"
    skipped=$((skipped + 1))
    continue
  fi

  echo
  npm publish --workspace "$name" $DRY
  published=$((published + 1))
done <<< "$ORDER"

echo
if [[ -n "$DRY" ]]; then
  echo "dry run finished: $published would be published, $skipped already on the registry"
else
  echo "published $published, skipped $skipped"
  echo "verifying every package is on the registry"
  node scripts/verify-published.mjs
fi
