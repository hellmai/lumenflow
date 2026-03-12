# WU-1051 Plan — wu:spawn skills guidance config-driven

## Goal

Make `wu:spawn` skills/agents guidance config-driven, vendor-agnostic by default, and accurate for any installation.

## Scope

- Resolve skills/agents directories from `.lumenflow.config.yaml` (client override -> directories default).
- Provide vendor-agnostic fallback only when known directories exist.
- Emit clear "no skills configured" guidance when nothing is configured or found.
- Ensure CLI/core output uses shared helpers for skills guidance.
- Add `.claude/CLAUDE.md` as a minimal pointer to `LUMENFLOW.md`.

## Approach

1. Add a core helper to resolve skills/agents paths and generate skills guidance sections.
2. Update core `wu-spawn` to use the helper (remove misleading auto-load section).
3. Update CLI `wu-spawn` to use the same helper (no divergent guidance).
4. Add `.claude/CLAUDE.md` (Claude entrypoint).
5. Update docs and tests for claude-code, codex-cli, and generic clients.

## Tests

- Unit: `packages/@lumenflow/core/src/__tests__/wu-spawn-refactor.test.ts`
- Unit: `packages/@lumenflow/cli/__tests__/wu-spawn.test.ts`
- Manual: run `pnpm wu:spawn --client claude-code`, `codex-cli`, and default client to confirm guidance.
