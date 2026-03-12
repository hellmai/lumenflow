# Documentation Index

Internal documentation for LumenFlow, organized by concern. Uses arc42 section numbering where applicable.

> **Note:** The public-facing documentation lives at [lumenflow.dev](https://www.lumenflow.dev) (source: `apps/docs/`). This `docs/` directory contains internal architecture, operations, and decision records.

---

## Quick Start by Role

| Role                 | Start Here                                               | Key Documents                               |
| -------------------- | -------------------------------------------------------- | ------------------------------------------- |
| **Product/Business** | [01-introduction-and-goals/](01-introduction-and-goals/) | Vision, quality goals, stakeholders         |
| **Engineering**      | [02-technical/](02-technical/)                           | Package architecture, implementation guides |
| **Operations**       | [04-operations/](04-operations/)                         | Tasks, WU management, framework docs        |
| **Architecture**     | [09-architecture-decisions/](09-architecture-decisions/) | ADRs, migration guides                      |

---

## Documentation Structure

### [01-introduction-and-goals/](01-introduction-and-goals/) — arc42 section 01

Product vision, quality goals, and stakeholder map.

- [vision.md](01-introduction-and-goals/vision.md) — what LumenFlow is and why it exists
- [quality-goals.md](01-introduction-and-goals/quality-goals.md) — top 5 quality goals driving architectural decisions
- [stakeholders.md](01-introduction-and-goals/stakeholders.md) — key stakeholder groups and their concerns

---

### [02-technical/](02-technical/) — Package Architecture

Technical architecture, package documentation, implementation guides.

> **Migration note:** This directory will be renamed to `05-building-block-view/` (proper arc42 section 05) in a future initiative. The content is correct; only the directory name needs updating.

---

### [04-operations/](04-operations/) — Operations

Task management, WU tracking, framework docs, and operational procedures.

> **Migration note:** This directory contains operational tooling content (WU management, backlog, onboarding) which does not map to arc42 section 04 ("Solution Strategy"). It will be reorganized in a future initiative.

**Key paths:**

- [tasks/backlog.md](04-operations/tasks/backlog.md) — master backlog
- [tasks/status.md](04-operations/tasks/status.md) — current WU status
- [\_frameworks/lumenflow/](04-operations/_frameworks/lumenflow/) — framework reference documentation

---

### [09-architecture-decisions/](09-architecture-decisions/) — arc42 section 09

Architecture Decision Records (ADRs) and companion migration guides.

- [ADR index](09-architecture-decisions/README.md) — full listing of all decisions
- [ADR template](09-architecture-decisions/ADR-000-template.md) — template for new ADRs

---

### [templates/](templates/) — Templates

Reusable templates for WUs, PRs, etc.

---

## Documentation Principles

1. **Single Source of Truth** — each concept documented once, referenced everywhere
2. **Audience-Driven** — organized by who needs it, not what it describes
3. **Self-Contained** — each document usable standalone with clear cross-references
4. **Living Documentation** — updated as part of WU Definition of Done

---

## Related Documentation

- **Root README:** [/README.md](../README.md) — quickstart and tech stack overview
- **Public docs site:** [lumenflow.dev](https://www.lumenflow.dev) — source in `apps/docs/`
- **Workflow:** [LUMENFLOW.md](../LUMENFLOW.md) — canonical workflow documentation

---

**Last Updated:** 2026-03-12
