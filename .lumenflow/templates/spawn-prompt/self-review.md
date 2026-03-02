---
id: self-review
name: Self-Review Before Completion
required: true
order: 850
tokens:
  - WU_ID
---

## Self-Review Before Completion

Before you finish {WU_ID}, review your diff against gate and craft checks:

1. [GATE] Repeated strings at your project threshold are extracted to named constants.
2. [STANDARD] Semantic numbers use named constants (except simple loop indexes and 0/1 guards).
3. [STANDARD] Error messages explain what failed, why, and how to fix.
4. [STANDARD] No `as` casts without preceding type narrowing or guards.
5. [GATE] No `TODO` or `FIXME` markers in production changes.
6. [GATE] Architecture boundaries are respected (no forbidden cross-layer imports).

Fix any failed checks before running completion commands.
