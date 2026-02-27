# INIT-046 Plan - Sidekick Pack and Runtime Surface

Created: 2026-02-27

## Goal

Deliver INIT-046 as a complete Sidekick pack and runtime-surface initiative in lumenflow-dev.

Primary objective:

- Ship a validated, enforcement-aligned 16-tool Sidekick contract and supporting runtime surfaces.

Outcome objective:

- Complete WU-2231 through WU-2237 with green quality gates, reproducible smoke flow, and publish-readiness evidence.

## Scope

Initiative scope is organized by the current WU set and phase model.

Phase 1 scope (pack contract and implementation):

1. WU-2231: Sidekick scaffold, manifest contract, schema + registration wiring.
2. WU-2232: StoragePort abstraction and filesystem default adapter.
3. WU-2233: Task and memory tool groups (descriptors + implementations + tests).
4. WU-2234: Channel, routine, and system tool groups (descriptors + implementations + tests).

Phase 2 scope (consumer abstraction and runtime surface):

1. WU-2235: Consumer abstraction contract package.
2. WU-2236: Generic HTTP dispatch endpoint POST /tools/:name with enforcement compatibility.

Phase 3 scope (validation and readiness):

1. WU-2237: End-to-end validation, gate convergence, smoke flow, and publish-readiness outputs.

Required contract shape:

- 16 tool declarations with schema-defined IO, explicit permissions, and explicit scope patterns.
- Write tools include audit scope coverage.
- Storage remains workspace-local and pack-enforced.

## Approach

Execution approach:

1. Phase 1 foundation first: WU-2231, WU-2232, WU-2233, WU-2234.
2. Phase 2 surfaces next: WU-2235 and WU-2236 (parallel when capacity allows).
3. Phase 3 validation last: WU-2237.

Implementation method:

- TDD per WU with manifest/storage/tool tests authored before final implementation.
- Keep manifest, descriptor metadata, and tool implementations aligned at each step.
- Run pack and gate validation frequently to catch scope/schema drift early.
- Use worktree lifecycle for code WUs and tooling lifecycle commands for plan/initiative metadata updates.

## Success Criteria

INIT-046 is complete when:

1. Sidekick manifest contract defines 16 tools with schemas, permissions, and scopes, and validates cleanly.
2. Storage abstraction supports pluggable ports with filesystem default and tested locking semantics.
3. Runtime dispatch endpoint POST /tools/:name is available with enforcement preserved.
4. Sidekick validation, smoke flow, and publish-readiness checks pass.
5. WU-2231 through WU-2237 are completed in initiative state and delivery artifacts are present.

## Risks

1. Contract drift between manifest declarations and tool implementation behavior.
   Mitigation: manifest tests + pack validation in each phase.

2. Concurrent write hazards in filesystem-backed storage.
   Mitigation: explicit lock path and concurrent write tests in storage suite.

3. Scope mismatch causing runtime deny behavior.
   Mitigation: verify permissions/scopes per tool descriptor and validate through pack:validate.

4. Late integration surprises for runtime dispatch.
   Mitigation: land endpoint tests and enforcement checks before final validation phase.

## Open Questions

1. Confirm canonical schema ownership for each tool group file as Phase 1 progresses.
2. Confirm any additional smoke cases needed beyond task/memory/channel/routine/system happy path.
3. Confirm expected report format for WU-2237 publish-readiness output artifacts.

## References

- Initiative: docs/04-operations/tasks/initiatives/INIT-046.yaml
- Work units: docs/04-operations/tasks/wu/WU-2231.yaml through docs/04-operations/tasks/wu/WU-2237.yaml
- Commands reference: docs/04-operations/\_frameworks/lumenflow/agent/onboarding/quick-ref-commands.md
- Existing handover: /home/USER/.lumenflow/strategy/lumenflow-dev/strategy/handovers/INIT-046-sidekick-pack-runtime-handover-2026-02-27.md
