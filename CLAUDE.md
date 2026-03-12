# LumenFlow OS Development Guide

**Last updated:** 2026-03-10

This repo contains LumenFlow source code. We dogfood LumenFlow to build LumenFlow.

**Read these first:**

1. [AGENTS.md](AGENTS.md) -- Universal agent startup rules (command discovery, help-first)
2. [LUMENFLOW.md](LUMENFLOW.md) -- Canonical workflow (Quick Start, Core Principles, commands, safety)

This file contains **Claude Code-specific** configuration only.

---

## Claude-Specific Principles

These supplement the Core Principles in LUMENFLOW.md:

1. **Dogfood LumenFlow**: Use LumenFlow workflow for all changes to this repo
2. **Design-First** (feature/refactor WUs): Load `/skill design-first` before implementation
3. **Library-First**: Search context7 before custom code
4. **Bootstrap**: Run `pnpm bootstrap` after `wu:claim` in worktrees (WU-1480)

## Lanes

Use "Parent: Sublane" format (e.g., `Framework: CLI WU Commands`). Lanes are defined in `workspace.yaml` under `software_delivery.lanes` -- that file is the canonical source. Add new lanes as needed via `pnpm lane:edit` or `pnpm config:set`.

```bash
pnpm wu:infer-lane --paths "packages/@lumenflow/cli/src/init.ts" --desc "Fix init scaffolding"
```

---

## Enforcement Hooks (WU-1367)

Claude Code hooks enforce LumenFlow workflow compliance at the tool level.
When enabled, hooks block non-compliant operations instead of relying on agents
to remember workflow rules.

Configure in `workspace.yaml`:

```yaml
software_delivery:
  agents:
    clients:
      claude-code:
        enforcement:
          hooks: true # Enable enforcement hooks
          block_outside_worktree: true # Block Write/Edit outside worktree
          require_wu_for_edits: true # Require claimed WU for edits
          warn_on_stop_without_wu_done: true # Warn on session end without wu:done
```

Generate hooks after configuration:

```bash
pnpm lumenflow:integrate --client claude-code
```

Hooks implement graceful degradation: if LumenFlow state cannot be determined,
operations are allowed to prevent blocking legitimate work.

---

## Known Bootstrap Issues

1. **Worktree CLI**: Fresh worktrees don't have CLI built. Run `pnpm bootstrap` after `wu:claim` to build `@lumenflow/cli` with its full dependency closure (core, memory, metrics, initiatives, agent). This enables dist-backed commands like `lane:health` and `gates`. For bootstrap WUs where even `pnpm bootstrap` cannot run, use `--skip-gates` with `--reason`.

2. **Missing tool scripts**: Some gates expect ExampleApp-specific tools. Stubs exist in `tools/` and `packages/linters/`.

---

## Documentation Structure

This repo follows the vendor-agnostic LumenFlow documentation structure.
See the **File Ownership Model** table in LUMENFLOW.md for which files are fully managed vs shared (merge-block) vs user-owned.

- **LUMENFLOW.md** - Main workflow entry point (fully managed — force-synced on upgrade)
- **LUMENFLOW.local.md** - Project-specific additions (user-owned, never overwritten)
- **.lumenflow/constraints.md** - Non-negotiable rules (fully managed)
- **.lumenflow/rules/** - Workflow rules
- **docs/operations/\_frameworks/lumenflow/agent/onboarding/** - Agent onboarding docs
- **apps/docs/src/content/docs/kernel/** - Kernel docs source
- **apps/docs/src/content/docs/packs/software-delivery/** - Software Delivery Pack docs source
- **apps/docs/src/content/docs/packs/software-delivery/languages/** - Pack-scoped language guides
- **apps/docs/src/data/version-policy.yaml** - Stable version truth file
- **apps/docs/src/data/language-support.yaml** - Language support truth file
- **apps/docs/src/data/example-repos.yaml** - Example repo truth file
- **.claude/** - Claude Code-specific configuration

---

## References

- [LUMENFLOW.md](LUMENFLOW.md) - Main workflow documentation
- [.lumenflow/constraints.md](.lumenflow/constraints.md) - Constraints capsule
- [docs/operations/\_frameworks/lumenflow/agent/onboarding/](docs/operations/_frameworks/lumenflow/agent/onboarding/) - Agent onboarding
- [LumenFlow Agent Capsule](docs/operations/_frameworks/lumenflow/lumenflow-agent-capsule.md)
- [Release Process](docs/operations/_frameworks/lumenflow/agent/onboarding/release-process.md) - Versioning, npm publish, Starlight docs
