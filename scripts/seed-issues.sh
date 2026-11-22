#!/usr/bin/env bash
# One-off: creates the labels, the brief issue and one GitHub issue per ticket file in .scratch/job-cards-v1/issues/.
# Run once from the repo root after the repo exists:  bash scripts/seed-issues.sh
# Safe to re-run: it skips tickets whose title already exists.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
repo=csmith0289/cominstall

for label in ticket brief qa needs-triage needs-info ready-for-agent ready-for-human in-progress blocked wontfix \
  "gate: dev" "gate: po-review" "gate: qa" "loop: stop" "priority: low"; do
  gh label create "$label" -R "$repo" --force >/dev/null
done

existing=$(gh issue list -R "$repo" --state all --limit 500 --json title --jq '.[].title')

if ! grep -qx "Brief" <<<"$existing"; then
  gh issue create -R "$repo" --title "Brief" --label brief --body "0 of 13 tickets closed. Nothing in progress. Waiting on you: nothing yet.

## Needs you
None

## Blockers
None

## Log
" >/dev/null
  echo "created Brief"
fi

declare -A number
for file in .scratch/job-cards-v1/issues/*.md; do
  title=$(head -1 "$file" | sed 's/^# //')
  nn=${title%%:*}
  if grep -qxF "$title" <<<"$existing"; then
    number[$nn]=$(gh issue list -R "$repo" --state all --search "\"$title\" in:title" --json number,title --jq ".[] | select(.title == \"$title\") | .number")
    continue
  fi
  status=$(grep -m1 '^\*\*Status:\*\*' "$file" | sed 's/\*\*Status:\*\* //')
  body="$(tail -n +3 "$file")

_From \`$file\`._"
  url=$(gh issue create -R "$repo" --title "$title" --label ticket --label "$status" --body "$body")
  number[$nn]=${url##*/}
  echo "created $title -> #${number[$nn]}"
done

# Turn "Blocked by: 01, 03" into issue links, in one pass so a new "#12" is never rewritten again.
map=$(for nn in "${!number[@]}"; do printf '%s=%s ' "$nn" "${number[$nn]}"; done)
for nn in "${!number[@]}"; do
  n=${number[$nn]}
  body=$(gh issue view "$n" -R "$repo" --json body --jq .body)
  new=$(MAP="$map" perl -pe 'BEGIN { %m = map { split /=/ } split " ", $ENV{MAP} } s/\b(\d\d)\b/exists $m{$1} ? "#$m{$1}" : $1/ge if /^\*\*Blocked by:\*\*/' <<<"$body")
  [[ "$new" != "$body" ]] && gh issue edit "$n" -R "$repo" --body "$new" >/dev/null
done
echo "done"
