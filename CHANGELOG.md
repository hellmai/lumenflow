# Changelog

All notable changes to the HellmAI Operating System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- None

## [1.0.0] - 2025-10-23

Initial release of HellmAI Operating System frameworks. Combines LumenFlow v2.0 workflow framework with COS v1.3 governance layer for multi-product reuse.

### Added - LumenFlow v2.0

- **Workflow Framework**: TDD-first, ports-first, hexagonal architecture discipline
- **Worktree Discipline**: Parallel WU execution with isolated git worktrees
- **Lane System**: 5 engineering lanes + 3 business lanes (8 total)
- **WIP=1 Enforcement**: One active work unit per lane
- **Definition of Done (DoD)**: Quality gates (format, lint, typecheck, tests)
- **WU Schema v2.0**: Work unit template with governance block
- **Complete Documentation**: Full framework specification in `lumenflow/`

### Added - COS v1.3 (Company Operating System)

- **Governance Rules**: Guardrails (must/never), targets (goals), rituals (cadence)
- **Evidence-Based Compliance**: Link, metric, screenshot, approval evidence types
- **Core Rules**: 5 company-wide rules applicable to all HellmAI products:
  - TRUTH-01: All incidents require public postmortems
  - UPAIN-01: All features must address documented user pain
  - FAIR-01: No dark patterns in pricing, cancellation, or consent flows
  - CASH-03: Commitments >£{SPEND_THRESHOLD}/month require spend review
  - GOV-WEEKLY: Weekly operating review ritual (30min, scoreboard-based)
- **Phased Rollout**: Minimal evidence requirements initially, add metrics as telemetry matures
- **STOP-AND-ASK**: Workflow for sensitive changes requiring governance review
- **Complete Documentation**: System prompt v1.3, evidence format spec, rules schema in `cos/`

### Added - Adoption Support

- **ADOPTION.md**: 5-step product setup guide (1-2 hour setup time)
  1. Clone hellmai/os to temporary directory
  2. Copy to project's `docs/04-operations/_frameworks/`
  3. Create `.lumenflow.config.yaml` from template
  4. Create `project-rules.yaml` extending core rules
  5. Copy/implement WU management tools (wu-claim, wu-done, cos-gates)
- **Configuration Template**: `templates/lumenflow.config.yaml` with all required fields documented
- **Project Rules Template**: `templates/project-rules.yaml` with 3 example rules (GDPR, API limits, security)
- **WU Template**: `templates/wu-template.yaml` matching schema v2.0 with optional governance block
- **Quick Start Guide**: Updated README.md with adoption instructions

### Infrastructure

- MIT License (or update if proprietary)
- Semantic versioning: v{major}.{minor}-lumenflow-v{lf_ver}-cos-v{cos_ver}
- Git tag: `v1.0-lumenflow-v2.0-cos-v1.3`

### Ready For

- ✅ ExampleApp framework adoption (Phase 2: WU-610, WU-611)
- ✅ Future HellmAI product integrations
- ✅ External consulting projects requiring workflow + governance frameworks

[Unreleased]: https://github.com/hellmai/os/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/hellmai/os/releases/tag/v1.0.0
