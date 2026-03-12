<!-- LUMENFLOW:START -->
# Universal Agent Instructions

**Last updated:** 2026-03-12

This project uses LumenFlow workflow. For complete documentation, see [LUMENFLOW.md](LUMENFLOW.md).
If `LUMENFLOW.local.md` exists, read it after LUMENFLOW.md for project-specific additions.

---

## First Session

Before doing any work, run these commands:

```bash
pnpm lumenflow:commands              # Discover all available CLI commands
<command> --help                      # Before first use of ANY command
```

**Three mandatory rules:**

1. Run `pnpm lumenflow:commands` before concluding a command doesn't exist
2. Run `<command> --help` before first use of any command -- do not guess
3. Never truncate `lumenflow:commands`, `--help`, or error/fix output (no `| head`, `| tail`)

For the full workflow, principles, and setup instructions, read [LUMENFLOW.md](LUMENFLOW.md).

---

## Quick Start

```bash
# 1. Claim a WU
pnpm wu:claim --id WU-XXXX --lane <Lane>
cd worktrees/<lane>-wu-xxxx

# 2. Work in worktree, run gates
pnpm gates

# 3. Complete (ALWAYS run this!)
cd <project-root>
pnpm wu:done --id WU-XXXX
```

> **Complete CLI reference:** See [quick-ref-commands.md](docs/_frameworks/lumenflow/agent/onboarding/quick-ref-commands.md)

---

## Critical: Always wu:done

After completing work, ALWAYS run `pnpm wu:done --id WU-XXXX` from the main checkout.

This is the single most forgotten step. See [LUMENFLOW.md](LUMENFLOW.md) for details.

---

## Essential Commands

| Command                   | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `pnpm wu:create`          | Create new WU spec (ID auto-generated)                |
| `pnpm wu:claim`           | Claim WU and create worktree (or `--cloud`)           |
| `pnpm wu:prep`            | Run gates in worktree, prep for wu:done               |
| `pnpm wu:done`            | Complete WU (merge or PR, stamp, cleanup)             |
| `pnpm wu:status`          | Show WU status, location, valid commands              |
| `pnpm wu:brief`           | **MANDATORY after wu:claim.** Generate handoff prompt + record evidence |
| `pnpm wu:delegate`        | Generate prompt + record delegation lineage           |
| `pnpm wu:recover`         | Analyze and fix WU state inconsistencies              |
| `pnpm wu:escalate`        | Show or resolve WU escalation status                  |
| `pnpm wu:delete`          | Delete WU spec and cleanup                            |
| `pnpm gates`              | Run all quality gates (`--docs-only` for docs)        |
| `pnpm lumenflow:commands` | List all public commands (primary + aliases + legacy) |
| `pnpm mem:checkpoint`     | Save progress checkpoint                              |
| `pnpm mem:recover`        | Generate recovery context                             |

---

## Core Principles

1. **Fit-For-Surface Verification**: Choose the least brittle verification that gives strong confidence. Prefer TDD for runtime logic when policy requires it; avoid brittle UI implementation-detail tests.
2. **Worktree Discipline**: After `wu:claim`, work ONLY in the worktree
3. **Gates Before Done**: Run `pnpm gates` before `wu:done`
4. **Never Bypass Hooks**: No `--no-verify`

---

## Forbidden Commands

- `git reset --hard`
- `git push --force`
- `git stash` (on main)
- `--no-verify`

---

## Vendor-Specific Overlays

This file provides universal guidance for all AI agents. Additional vendor-specific configuration:

- **Claude Code**: See `CLAUDE.md` (if present)
- **Cursor**: See `.cursor/rules/lumenflow.md` (if present)
- **Windsurf**: See `.windsurf/rules/lumenflow.md` (if present)

<!-- LUMENFLOW:END -->
