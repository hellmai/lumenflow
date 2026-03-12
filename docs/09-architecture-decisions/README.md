# Architecture Decisions

Architecture Decision Records (ADRs) for LumenFlow, following arc42 section 09.

---

## Index

| ADR                                                 | Title                                             | Status   | Date       |
| --------------------------------------------------- | ------------------------------------------------- | -------- | ---------- |
| [ADR-001](ADR-001-hexagonal-architecture.md)        | Hexagonal Architecture for @lumenflow/core        | Accepted | 2026-01-25 |
| ADR-002                                             | _(retired)_                                       | —        | —          |
| [ADR-003](ADR-003-methodology-templates.md)         | Configurable Methodology Templates                | Accepted | 2026-01-30 |
| [ADR-004](ADR-004-error-return-contracts.md)        | Standardized Error Return Contracts               | Accepted | 2026-02-24 |
| [ADR-005](ADR-005-main-branch-sync-semantics.md)    | Main-Branch Sync Semantics and Consolidation Plan | Accepted | 2026-02-26 |
| [ADR-006](ADR-006-delegation-package-extraction.md) | Delegation Package Extraction                     | Accepted | 2026-03-02 |

---

## Companion Documents

ADRs may have companion migration guides when external consumers are affected:

- [Migration Guide: Hexagonal Architecture](migration-guide-hexagonal-architecture.md) — for ADR-001

---

## Creating a New ADR

Use the template: [ADR-000-template.md](ADR-000-template.md)

1. Copy the template and rename to `ADR-NNN-short-title.md`
2. Use the next available number (currently ADR-007)
3. Fill in all sections; set status to `Proposed`
4. Update this index when the ADR is merged
5. If the ADR requires a migration guide, create a companion `migration-guide-short-title.md` in this directory
