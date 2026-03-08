#!/usr/bin/env bash
#
# format-guard.sh — Blocks unscoped prettier runs.
#
# Usage:
#   pnpm format <file1> <file2> ...   # OK — formats specific files
#   pnpm format                        # BLOCKED — would reformat entire repo
#
# Why: Unscoped `prettier --write .` reformats every file in the repo,
# creating hundreds of dirty-state changes that block wu:done.
# Use `pnpm format:check` for read-only validation (gates use this).
# Use `pnpm prettier --write <files>` for targeted fixes.

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "" >&2
  echo "ERROR: Unscoped 'pnpm format' is blocked." >&2
  echo "" >&2
  echo "  It would reformat every file in the repo, creating dirty-state." >&2
  echo "" >&2
  echo "  Instead, use:" >&2
  echo "    pnpm prettier --write <file1> <file2> ...   # format specific files" >&2
  echo "    pnpm format:check                            # read-only check (gates)" >&2
  echo "" >&2
  exit 1
fi

exec prettier --write "$@"
