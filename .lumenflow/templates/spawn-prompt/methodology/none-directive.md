---
id: methodology-none
name: No Testing Methodology Directive
required: false
order: 5
tokens: []
condition: "policy.testing === 'none' && type !== 'documentation' && type !== 'docs' && type !== 'config' && type !== 'refactor' && type !== 'visual' && type !== 'design' && type !== 'ui' && work.domain !== 'ui' && work.testMethodologyHint !== 'smoke-test' && work.testMethodologyHint !== 'structured-content'"
---

## TESTING GUIDANCE

No specific testing methodology is enforced for this repository on runtime code paths.

### Recommendations

While no methodology is mandated, consider:

- Writing tests for critical paths
- Ensuring confidence in your changes
- Documenting manual verification in WU notes if automated tests are not feasible

### Coverage Requirements

- **Target**: None (0%)
- **Mode**: Off (coverage not enforced)

### Test Ratchet Still Applies

Even without a testing methodology:

- **NEW test failures** still block gates (if tests exist)
- **Pre-existing failures** in baseline are warnings only

This prevents regressions while allowing flexibility in testing approach.
