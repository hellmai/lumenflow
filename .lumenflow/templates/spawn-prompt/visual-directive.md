---
id: visual-directive
name: Visual/Design Directive
required: false
order: 15
tokens: []
condition: "type === 'visual' || type === 'design' || type === 'ui' || work.testMethodologyHint === 'smoke-test'"
---

## UI/Visual Verification Strategy

**Assert behavior, not presentation.** Tests must verify what a user can do, not how the page looks.

### Recommended Order

1. Cover critical user flows with integration or E2E tests when behavior crosses component boundaries
2. Add smoke/render coverage for crash-prone states, loading states, and empty states
3. Use unit tests for pure logic only (formatters, reducers, validators, accessibility helpers, slug builders)
4. Verify responsive behavior and accessibility manually or with automation

### Anti-Patterns (NEVER do these in E2E or integration tests)

- Assert inline style values, CSS hue/color numbers, or computed styles
- Assert exact marketing copy, button labels, or heading text that changes with content updates
- Use substring label matching that catches multiple elements (e.g., `getByLabel('Password')` matching both an input and a toggle button)
- Snapshot entire DOM structures, CSS class lists, or markup shape
- Assert OG meta tag content strings beyond existence

### Do Instead

- Select elements by `data-testid`, ARIA roles, or `{ exact: true }` label matching
- Assert behavior: page loads without error, form submits, navigation works, sections render
- Assert element existence and visibility, not text content
- For auth flows: assert redirect happens, not button text
- For SEO: assert meta tags exist and are non-empty, not their exact values
