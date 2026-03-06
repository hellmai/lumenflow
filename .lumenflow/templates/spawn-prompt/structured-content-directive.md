---
id: structured-content-directive
name: Structured Content Directive
required: false
order: 15
tokens: []
condition: "work.testMethodologyHint === 'structured-content' && type !== 'documentation' && type !== 'docs' && type !== 'config'"
---

## Structured Content Testing

**Prefer parse/lint/evaluator validation over runtime TDD** for structured-content work.

### Requirements

1. Validate parseability and schema compatibility where applicable
2. Run the relevant lint, format, or evaluator command for the changed content
3. Add smoke coverage only when content changes alter a runtime path
4. Record evidence of the validation you used in the WU notes or completion output
