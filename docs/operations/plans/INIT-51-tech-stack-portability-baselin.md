# INIT-51 Plan - Tech Stack Portability Baseline

## Goal

Deliver a concrete, supportable tech-stack portability baseline for LumenFlow so generic lifecycle
paths do not assume a pnpm monorepo with `apps/web`, `packages/`, `tools/`, or Next.js-style app
router conventions.

Primary objective:

- Make generic workflow behavior derive from config, repo capabilities, and detected project shape
  instead of monorepo-web defaults.

Outcome objective:

- After INIT-51, a consumer project that is not a Next.js monorepo can still run the core
  LumenFlow lifecycle (`init`, `wu:create`, `wu:claim`, `wu:brief`, `wu:prep`, `wu:done`) without
  broken default paths, hardcoded package-manager instructions, or framework-specific guidance.

Portability boundary:

- This initiative keeps LumenFlow as a Node-distributed CLI.
- "Tech-stack portability" here means consumer project compatibility, not removing the Node runtime
  requirement for the LumenFlow toolchain itself.

## Scope

In scope:

1. Runtime and command portability in generic lifecycle paths.

- Remove hardcoded generic commands that assume `pnpm` or Turborepo where the command should be
  derived from config or a runtime helper.
- Current examples:
  - `packages/@lumenflow/core/src/lumenflow-config.ts`
  - `packages/@lumenflow/core/src/wu-done-docs-generate.ts`
  - generic onboarding/help text that implies one package manager or workspace tool by default

2. Repo-shape portability in defaults and gate planning.

- Replace assumptions that every repo uses `apps/`, `packages/`, `tools/`, or `apps/web` in generic
  planning logic.
- Current examples:
  - `packages/@lumenflow/core/src/schemas/directories-config.ts`
  - `packages/@lumenflow/cli/src/gates-plan-resolvers.ts`

3. Framework heuristic portability in classification and guidance.

- Narrow framework-specific heuristics so they act as optional signals, not silent defaults.
- Current examples:
  - `packages/@lumenflow/core/src/work-classifier.ts`
  - onboarding/template flows that imply web-dashboard or Next.js-first structure

4. Portability contract and validation matrix.

- Define the supported archetypes for this baseline and add smoke validation for them.
- Candidate baseline archetypes:
  - single-package repo with no `apps/` or `packages/`
  - monorepo with no `apps/web`
  - backend/docs/service repo that is not Next.js-driven

Out of scope:

- Replacing the Node/npm distribution model for the LumenFlow CLI itself
- Making every command first-class across every package manager in one pass
- Project-local gate command customization beyond the generic lifecycle defaults
- Spawn/orchestration vendor portability already covered by INIT-50

## Approach

Execution should stay compact. Do not explode this into many small WUs up front. Start with one
plan, then cut the minimum useful implementation slices after the first audit pass.

Recommended initial execution cut:

1. Command/runtime baseline

- Audit all generic lifecycle copy and execution paths for hardcoded `pnpm`, `turbo`, and
  workspace-shape assumptions.
- Introduce shared helpers for package-manager-aware command rendering/execution where the code path
  is meant to be generic.
- Prioritize high-impact paths first:
  - `lumenflow-config.ts` (`pnpm workspace-init --yes`)
  - `wu-done-docs-generate.ts` (`pnpm turbo docs:generate`)
  - init/onboarding/help output that prints generic commands

2. Repo-shape and gate-planning baseline

- Move generic path planning off root-prefix assumptions where possible.
- Make incremental lint/test/docs decisions use configured directories or detected workspace shape
  rather than raw `apps/`, `packages/`, `tools/` prefixes.
- Validate docs-only and incremental modes against repos that do not match the current monorepo
  layout.

3. Framework heuristics and guidance baseline

- Keep work classification capability-oriented, but demote Next.js-specific patterns from "default
  truth" to one signal among several.
- Ensure onboarding/guidance only references web-app structure when configured or detected.
- Align docs to state the portability contract explicitly.

4. Validation and convergence

- Define a small smoke matrix and use it as the closure gate for the initiative.
- Prefer a maximum of four implementation WUs for the whole initiative:
  - command/runtime portability
  - repo-shape and gate-planning portability
  - classifier/onboarding guidance portability
  - validation matrix and convergence

Implementation principle:

- Fix generic paths first, then document the contract, then expand support only where validation
  proves the next slice is necessary.

## Success Criteria

INIT-51 is complete when all of the following are true:

1. Generic lifecycle command portability

- No generic lifecycle path still hardcodes `pnpm workspace-init --yes` or `pnpm turbo
docs:generate` when that behavior should be resolved from config/capability helpers.

2. Repo-shape portability

- Default directory resolution and incremental gate planning work for at least:
  - a single-package repo without `apps/` or `packages/`
  - a monorepo without `apps/web`
  - a backend/docs-oriented repo that never matches Next.js app-router conventions

3. Guidance portability

- Onboarding, help output, and generated workflow guidance do not imply Next.js/web structure unless
  config or code paths justify it.

4. Explicit contract

- LumenFlow docs state the portability boundary clearly:
  - consumer repos can vary by stack and shape
  - LumenFlow remains a Node-distributed CLI
  - the supported baseline archetypes are documented

5. Validation evidence

- The supported archetype matrix is backed by smoke verification and recorded in initiative closure
  evidence.

## Risks

1. Over-abstracting the command layer.

- Risk: generic command helpers become more complex than the current hardcoded paths.
- Mitigation: limit abstraction to shared lifecycle paths and keep project-local commands
  configurable.

2. Hidden monorepo assumptions outside the obvious files.

- Risk: fixing the first examples still leaves path or gating regressions in adjacent flows.
- Mitigation: start with an audit pass and validate against archetype fixtures before cutting final
  WUs.

3. Support matrix sprawl.

- Risk: "any tech stack" turns into an unbounded promise.
- Mitigation: publish an explicit baseline matrix for this initiative and treat additional
  archetypes as later expansion work.

4. Docs and code drift.

- Risk: the implementation becomes more portable than the onboarding docs or vice versa.
- Mitigation: keep documentation alignment in the same initiative rather than a follow-up cleanup.

## References

- Initiative: INIT-51
- Created: 2026-03-10
- `docs/operations/tasks/initiatives/INIT-51.yaml`
- `docs/operations/tasks/initiatives/INIT-50.yaml`
- `packages/@lumenflow/core/src/lumenflow-config.ts`
- `packages/@lumenflow/core/src/wu-done-docs-generate.ts`
- `packages/@lumenflow/core/src/schemas/directories-config.ts`
- `packages/@lumenflow/cli/src/gates-plan-resolvers.ts`
- `packages/@lumenflow/core/src/work-classifier.ts`
