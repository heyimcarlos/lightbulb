#!/bin/bash
set -e

repo_root="${1:-.}"
cd "$repo_root"

if [ ! -d .git ]; then
  echo "Error: $(pwd) is not a git repository root. Run from the repo root or pass the repo root path." >&2
  exit 1
fi

mkdir -p thoughts/shared/{tickets,questions,research,design,structure,plans,handoffs}

if [ ! -f .gitignore ]; then
  touch .gitignore
fi

if ! grep -qx 'thoughts/' .gitignore; then
  # Ensure a clean separator unless the file is empty or already ends in a blank line.
  if [ -s .gitignore ] && [ "$(tail -c 1 .gitignore)" != "" ]; then
    printf '\n' >> .gitignore
  fi
  printf '\n# QRSPI local metadata\nthoughts/\n' >> .gitignore
fi

if ! test -d thoughts/shared/plans; then
  echo "Error: thoughts/shared/plans was not created" >&2
  exit 1
fi

if ! grep -qx 'thoughts/' .gitignore; then
  echo "Error: .gitignore does not contain thoughts/" >&2
  exit 1
fi

printf '{"repo":"%s","created":"thoughts","gitignore":"thoughts/"}\n' "$(pwd)"
