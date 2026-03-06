---
id: visual-directive
name: Visual/Design Directive
required: false
order: 15
tokens: []
condition: "type === 'visual' || type === 'design' || type === 'ui' || work.testMethodologyHint === 'smoke-test'"
---

## UI/Visual Verification Strategy

**Prefer user-outcome verification over brittle DOM assertions** for UI-classified work.

### Recommended Order

1. Cover critical user flows with integration or E2E tests when behavior crosses component boundaries
2. Add smoke/render coverage for crash-prone states, loading states, and empty states
3. Use unit tests for pure logic only (formatters, reducers, validators, accessibility helpers, slug builders)
4. Verify responsive behavior and accessibility manually or with automation
5. Avoid tests that only snapshot CSS classes or markup shape unless that contract is intentional
