---
id: design-context-ui
name: Design Context (UI)
required: false
order: 65
tokens: []
condition: "work.domain === 'ui'"
---

## Design Context

This work involves UI components or styling. Follow these guidelines:

### Pattern Check

- Before creating new components, check for existing patterns in the codebase
- Reuse design-system tokens and shared primitives before adding custom variants

### Viewport Verification

- Verify the changed flow at mobile, tablet, and desktop breakpoints
- Check for overflow, truncation, and layout shift in the states you touch

### Accessibility

- Verify keyboard navigation and focus behavior for any interactive element
- Check color contrast and visible labels where the change affects them
