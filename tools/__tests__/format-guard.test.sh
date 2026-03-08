#!/usr/bin/env bash
# Test: tools/format-guard.sh blocks unscoped runs
# Run: bash tools/__tests__/format-guard.test.sh

set -euo pipefail

SCRIPT="$(dirname "$0")/../format-guard.sh"
PASS=0
FAIL=0

assert_exit() {
  local expected="$1"
  shift
  local desc="$1"
  shift

  local actual
  "$@" >/dev/null 2>&1 && actual=0 || actual=$?

  if [ "$actual" -eq "$expected" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected exit $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "format-guard.sh tests:"
echo ""

# AC1: No args = blocked (exit 1)
assert_exit 1 "blocks when no file args provided" bash "$SCRIPT"

# AC2: With args = attempts to run prettier (may fail if prettier not in PATH, but NOT exit 1)
# We just verify it doesn't exit 1 (the guard code). It may exit 127 (command not found) or 0.
output=$(bash "$SCRIPT" /dev/null 2>&1 || true)
if echo "$output" | grep -q "Unscoped"; then
  echo "  FAIL: with file args should not show 'Unscoped' error"
  FAIL=$((FAIL + 1))
else
  echo "  PASS: with file args does not show 'Unscoped' error"
  PASS=$((PASS + 1))
fi

# AC3: Error message is helpful
output=$(bash "$SCRIPT" 2>&1 || true)
if echo "$output" | grep -q "pnpm prettier --write"; then
  echo "  PASS: error message shows correct alternative command"
  PASS=$((PASS + 1))
else
  echo "  FAIL: error message should mention 'pnpm prettier --write'"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
