#!/usr/bin/env bash
# Rebuild main + the merge order in FORK.md in a throwaway worktree and diff it with develop.
# Any difference outside FORK.md's develop-only files means something was changed in develop alone.
# Usage: scripts/fork/rebuild-develop.sh [base-ref] [target-ref]   (defaults: main develop)
set -euo pipefail

base=${1:-main}
target=${2:-develop}
repo=$(git rev-parse --show-toplevel)
fork_md=$(git -C "$repo" show "$target:FORK.md")

section() {
  printf '%s\n' "$fork_md" | sed -n "/<!-- $1 -->/,/<!-- \/$1 -->/p" | sed -n 's/^- //p' | tr -d '\r'
}
mapfile -t branches < <(section merge-order)
mapfile -t develop_only < <(section develop-only)

tmp=$(mktemp -d)
cleanup() { git -C "$repo" worktree remove --force "$tmp" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

git -C "$repo" worktree add --detach --quiet "$tmp" "$base"
# Conflicts between themes are resolved once, when merging into develop with rerere on (as below), and replayed
# from git's rerere cache here
rerere=(-c rerere.enabled=true -c rerere.autoUpdate=true)
for b in "${branches[@]}"; do
  echo "merging $b"
  if ! git "${rerere[@]}" -C "$tmp" merge --no-ff --quiet --no-edit "$b" >/dev/null 2>&1; then
    if [ -n "$(git -C "$tmp" diff --name-only --diff-filter=U)" ]; then
      echo "conflict merging $b onto $base + earlier themes, with no recorded resolution" >&2
      git -C "$tmp" diff --name-only --diff-filter=U >&2
      echo "resolve it with: git -c rerere.enabled=true merge ... in develop (or train rerere on the merge)" >&2
      exit 2
    fi
    echo "  replayed a recorded conflict resolution"
    git -C "$tmp" commit --quiet --no-edit
  fi
done

excludes=()
for p in "${develop_only[@]}"; do excludes+=(":(exclude)$p"); done

if git -C "$repo" diff --quiet "$(git -C "$tmp" rev-parse HEAD)" "$target" -- . "${excludes[@]}"; then
  echo "no drift: $target = $base + ${#branches[@]} theme(s) + develop-only files"
else
  echo "drift: $target differs from $base + themes outside the develop-only files:" >&2
  git -C "$repo" diff --stat "$(git -C "$tmp" rev-parse HEAD)" "$target" -- . "${excludes[@]}" >&2
  exit 1
fi
