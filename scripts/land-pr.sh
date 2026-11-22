#!/usr/bin/env bash
# Lands a ticket PR on master without the migration clash:
#   1. checks the PR branch out in its own worktree (your folder and running app are untouched),
#   2. merges up-to-date master into it,
#   3. throws away the branch's own Drizzle migrations and regenerates them on top of master's,
#      so they always number and timestamp after everything already on master,
#   4. runs the CI suite with scripts/check.sh (typecheck, unit and e2e, e2e retried once for #100),
#   5. pushes and merges the PR with a merge commit.
# Stops without merging (exit 2) if code conflicts or a hand-written migration need a human or an agent,
# and (exit 1) if anything else fails, including a red suite. Nothing is pushed in either case.
#
# Usage (Git Bash):  bash scripts/land-pr.sh <pr-number> [--no-merge]
set -euo pipefail

usage() { echo "usage: land-pr.sh <pr-number> [--no-merge]" >&2; exit 1; }
[ $# -ge 1 ] && [ $# -le 2 ] || usage
pr="$1"
[[ "$pr" =~ ^[0-9]+$ ]] || usage
merge=yes
case "${2:-}" in
  "") ;;
  --no-merge) merge=no ;;
  *) usage ;;
esac
pnpm() { corepack pnpm "$@"; }
needs_hand() { echo "!! $1"; echo "Nothing was pushed."; exit 2; }
fail() { echo "!! $1"; echo "Nothing was pushed."; exit 1; }

repo=$(git rev-parse --show-toplevel)
branch=$(gh pr view "$pr" --json headRefName --jq .headRefName)
work="$repo/../land-$pr"
echo "== PR #$pr ($branch) in $work"

git -C "$repo" fetch -q origin
rm -rf "$work"; git -C "$repo" worktree prune
git -C "$repo" worktree add -q -B "land-$pr" "$work" "origin/$branch"
cleanup() { cd "$repo"; git worktree remove --force "$work" 2>/dev/null || echo "(left $work behind: Windows path limit; delete it by hand)"; git branch -q -D "land-$pr" 2>/dev/null || true; }
trap cleanup EXIT
cd "$work"
git branch -q --set-upstream-to "origin/$branch"

# The branch's own migrations: the .sql files it added since it left master.
mapfile -t own < <(git diff --name-only --diff-filter=A origin/master...HEAD -- 'drizzle/*.sql')
name=""
if [ ${#own[@]} -gt 0 ]; then
  # Only schema migrations can be rebuilt from the schema; data or hand-written SQL would be lost.
  if grep -qiE '^[[:space:]]*(insert|update|delete|do|create (or replace )?function|create trigger)\b' "${own[@]}"; then
    # They can stay as they are while master has added no migration since the branch left it.
    if [ -n "$(git diff --name-only --diff-filter=A HEAD...origin/master -- 'drizzle/*.sql')" ]; then
      needs_hand "${own[*]} contain hand-written SQL that regenerating would lose; renumber them after master's latest migration by hand"
    fi
    echo "== branch migrations: ${own[*]} (hand-written; master has no newer migration, so they're kept as they are)"
  else
    name=$(basename "${own[0]}" .sql | sed 's/^[0-9]*_//')
    echo "== branch migrations: ${own[*]} -> will regenerate as '$name'"
  fi
fi

if ! git merge -q --no-edit origin/master -m "Merge master into $branch"; then
  [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ] || fail "git merge failed without starting a merge (identity, lock file?)"
  conflicted=$(git diff --name-only --diff-filter=U)
  [ -n "$conflicted" ] || { git merge --abort; fail "git merge failed without conflicts"; }
  bad=$(grep -v '^drizzle/' <<<"$conflicted" || true)
  # Conflicts in drizzle/ are only resolved here when the branch has a migration to regenerate.
  [ -z "$name" ] && bad="$conflicted"
  if [ -n "$bad" ]; then
    git merge --abort
    needs_hand "Code conflicts need resolving by hand or an agent:"$'\n'"$bad"
  fi
fi

if [ -n "$name" ]; then
  # Master's migration history wins; the branch's migrations are rebuilt from its schema.
  git rm -r -q -f drizzle/
  # Master may have no migrations yet (the first ticket), so neither step may fail on a missing drizzle/.
  if [ -n "$(git ls-tree --name-only origin/master -- drizzle/)" ]; then git checkout -q origin/master -- drizzle/; fi
  count_sql() { { find drizzle -maxdepth 1 -name '*.sql' 2>/dev/null || true; } | wc -l; }
  before=$(count_sql)
  pnpm install --frozen-lockfile >/dev/null
  # stdin from /dev/null: if drizzle-kit wants to ask about a rename it fails instead of hanging.
  pnpm db:generate --name "$name" </dev/null || fail "drizzle-kit generate failed (a rename question needs a human?)"
  after=$(count_sql)
  [ "$after" -gt "$before" ] || fail "regenerating produced no migration for '$name', but the branch had one"
  git add -A drizzle/
fi
if [ -f "$(git rev-parse --git-dir)/MERGE_HEAD" ]; then
  git commit -q --no-edit
elif ! git diff --cached --quiet; then
  git commit -q -m "Regenerate $branch's migration on top of master's"
fi

echo "== suite"
bash scripts/check.sh || fail "the suite is red"

# The suite has just passed on this exact commit, so the pre-push hook needn't run it again.
SKIP_LOCAL_CHECKS=1 git push -q origin "HEAD:$branch"
head=$(git rev-parse HEAD)
echo "== pushed ${head:0:7} to $branch"

if [ "$merge" = yes ]; then
  gh pr merge "$pr" --merge --delete-branch=false --match-head-commit "$head"
  echo "== PR #$pr merged"
fi
