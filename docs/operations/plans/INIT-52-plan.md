# Agent Runtime Pack — Full-Delivery Initiative Brief

## Context

LumenFlow already has the right governance substrate for agent execution:

- scope intersection
- deny-wins policy evaluation
- evidence receipts
- sandboxed subprocess execution

This initiative delivers the full `agent-runtime` pack on top of that kernel. The pack is not a general-purpose agent framework. It is a governed runtime for model turns, tool access, provider access, workflow progression, and auditability.

This brief replaces the old MVP / roadmap split with one initiative containing sequenced WUs that together deliver the whole pack.

## ADR First

The first WU is an ADR in the target repo's arc42 structure:

- Target path: verify in the actual OSS repo before execution; do not hardcode a docs path from this checkout into the public initiative
- Purpose: lock the architectural boundary before kernel and pack implementation begins

The ADR should record:

- why `agent-runtime` is a separate pack rather than a `sidekick` extension
- why the pack remains provider-neutral and does not depend on external AI SDKs
- why `agent:execute-turn` is the core tool surface
- why policy enforcement happens in the kernel, not in prompt guards
- why delivery is phased through kernel foundations, core runtime, expansion, and orchestration
- where framework-level orchestration stops and pack-owned `agent-session` orchestration begins
- how scheduled and resumed execution remain part of the `agent-session` task model rather than creating a shadow execution class

## Locked Architectural Decisions

- No external SDK dependency in the pack. Pack import boundaries permit `node:*`, `@lumenflow/kernel`, and relative imports only.
- `task_types: ['agent-session']` only. `work-unit` remains owned by software-delivery.
- Initial provider execution uses a provider-neutral compatible chat-turn adapter over built-in `fetch`.
- Tool execution stays sandboxed. Credentials flow through explicit env allowlisting, not in-process exceptions.
- Dynamic intent gating is implemented through kernel policy, not prompt rules.
- The pack is separate from `sidekick`; composition with `sidekick` is loose and host-driven.
- Sidekick remains intentionally small and domain-focused. Generic model-turn and agent orchestration concerns belong in `agent-runtime`, not in a broadened Sidekick built-in surface.
- If any Sidekick-adjacent follow-up emerges during delivery, new built-in tools should exist only for new governance, state, evidence, or orchestration primitives; API-wrapper breadth stays outside the built-in core.
- Framework-level orchestration remains outside the pack; only `agent-session` domain orchestration may become pack-owned.
- Scheduled routines, resumptions, and branches remain execution modes inside `agent-session`; they do not introduce a second task model.
- The full initiative ends with pack-owned `agent-session` orchestration, suspend/resume, branching, scheduling, policy-aware tool filtering, streaming, and multi-provider support.

## OSS Constraints To Re-Validate Before Execution

These are the architecture assumptions this initiative currently depends on. They were derived from the local checkout used to draft the brief and must be re-validated against the actual OSS repo before WUs are created there.

- Packs do not allow arbitrary npm imports and therefore the pack should remain free of hard runtime dependencies on external AI SDKs.
- Generic pack config is not yet preserved and validated through runtime initialization for non-kernel config roots.
- Manifest-authored policies are still more limited than runtime `PolicyRule` behavior.
- Tool listing is not yet policy-aware and needs a filtered execution-context API rather than raw registry enumeration.
- Sandbox env handling still needs explicit allowlisting rather than ambient inheritance.

## Initiative Outcome

When all WUs in this initiative are complete, LumenFlow will have:

- a documented architecture decision for the governed agent runtime
- a new `agent-runtime` pack with `agent:execute-turn`
- runtime-visible validated pack config
- dynamic intent-based tool gating via `policy_factory`
- sandboxed credential passthrough via manifest-declared env allowlists
- static and config-derived provider network capability resolution
- policy-aware tool discovery for execution contexts and intents
- streaming model turns with evidence support
- multi-provider adapter support
- pack-owned workflow state, suspend/resume, branching, and scheduled routines
- a smaller, domain-focused Sidekick boundary that does not absorb generic model-turn runtime concerns
- public docs and examples that fit the repo's arc42 layout

## OSS Guidance Incorporated Into This Initiative

The following architecture guidance is intentionally reflected in the WU breakdown, but should still be re-validated in the actual OSS repo before execution there:

- Kernel improvements proposed by this initiative map directly to `WU-02` through `WU-04`, `WU-08`, `WU-09`, `WU-10`, `WU-12`, and `WU-13`.
- Provider adapter contract testing is treated as pack/shared-test infrastructure in `WU-06`, not as a kernel-owned feature.
- `agent-runtime` remains a separate pack with provider-neutral contracts and kernel-enforced policy boundaries.
- Framework orchestration stays outside the pack; only `agent-session` domain orchestration becomes pack-owned over later WUs.
- Sidekick guidance is architectural only in this brief. Do not translate it into OSS-local facts unless the target repo documents the same boundary there.

## WU Sizing Strategy

This initiative is deliberately split by independently shippable outcomes, not by artifact type or implementation step. The sizing below follows `docs/operations/_frameworks/lumenflow/wu-sizing-guide.md`.

- Documentation-only ADR work stays a small single-session WU.
- Kernel cross-cutting changes are mostly medium WUs using `checkpoint-resume`.
- Workflow orchestration is split into two WUs because linear suspend/resume can ship and be reviewed independently from DAG branching and routine scheduling.
- Tool filtering / auto-discovery is separate from workflow orchestration because it is a kernel capability boundary, not a workflow-state concern.

## Sequenced WUs

These `WU-01` ... `WU-14` labels are sequencing placeholders for the initiative brief. Replace them with real globally assigned WU IDs when the work is entered into LumenFlow tasking.

### Phase 1 — Architecture and Kernel Foundations

#### WU-01 — ADR for Governed Agent Runtime Pack

- Type: `documentation`
- Outcome: create the architecture decision record in the target repo's verified ADR location and anchor the initiative in that repo's arc42 structure
- Dependencies: none
- Sizing:
  - `estimated_files: 6`
  - `estimated_tool_calls: 25`
  - `strategy: single-session`
- Acceptance:
  - ADR created for the `agent-runtime` pack
  - ADR states kernel vs pack boundary, provider-neutrality, host-vs-pack orchestration split, and delivery phases
  - ADR explicitly defines that framework-level orchestration stays outside the pack while `agent-session` orchestration may become pack-owned
  - ADR explicitly defines that scheduled and resumed execution remain within the `agent-session` task model
  - ADR path and cross-links are verified against the actual OSS repo before implementation starts

#### WU-02 — Runtime Pack Config Plumbing

- Type: `feature`
- Outcome: preserve, validate, and attach pack config during runtime initialization
- Dependencies: `WU-01`
- Sizing:
  - `estimated_files: 14`
  - `estimated_tool_calls: 70`
  - `strategy: checkpoint-resume`
- Acceptance:
  - runtime init extracts pack config from raw workspace YAML for pinned packs with `config_key`
  - `config_schema` is validated during runtime startup
  - resolved pack config is attached to loaded pack state for later policy/tool resolution
  - invalid pack config fails startup
  - packs without `config_key` remain unaffected

#### WU-03 — Policy Substrate for Governed Agent Turns

- Type: `feature`
- Outcome: expose runtime policy capabilities needed for intent-gated agent execution
- Dependencies: `WU-01`, `WU-02`
- Sizing:
  - `estimated_files: 12`
  - `estimated_tool_calls: 65`
  - `strategy: checkpoint-resume`
- Acceptance:
  - `approval_required` supported in manifest-authored policies
  - `execution_metadata` propagated into `PolicyEvaluationContext`
  - manifest supports `policy_factory`
  - runtime loads factory rules with startup-blocking validation
  - factory receives resolved pack config

#### WU-04 — Sandbox Credential Hardening

- Type: `feature`
- Outcome: make provider credentials compatible with sandboxed execution without ambient env leakage
- Dependencies: `WU-01`, `WU-02`
- Sizing:
  - `estimated_files: 10`
  - `estimated_tool_calls: 50`
  - `strategy: checkpoint-resume`
- Acceptance:
  - `required_env` supported on pack tool declarations
  - sandbox uses `--clearenv` and explicit env re-add only
  - runtime cross-validates pack-config env references against declared `required_env`
  - tests prove undeclared env vars do not pass through

### Phase 2 — Core Pack Delivery

#### WU-05 — Agent Runtime Pack Scaffold

- Type: `feature`
- Outcome: create the pack skeleton, config schema, manifest, and static provider allowlist baseline
- Dependencies: `WU-01`, `WU-02`, `WU-03`, `WU-04`
- Sizing:
  - `estimated_files: 12`
  - `estimated_tool_calls: 45`
  - `strategy: single-session`
- Acceptance:
  - `agent-runtime` pack exists with manifest, constants, types, tool implementation layout, and config schema
  - manifest declares `task_types: ['agent-session']`
  - initial provider network scopes use static manifest allowlists
  - pack integrity and import boundaries remain valid

#### WU-06 — `agent:execute-turn` Core Tool

- Type: `feature`
- Outcome: deliver the core governed model-turn tool with structured output and provider call support
- Dependencies: `WU-04`, `WU-05`
- Sizing:
  - `estimated_files: 14`
  - `estimated_tool_calls: 80`
  - `strategy: checkpoint-resume`
- Acceptance:
  - `agent:execute-turn` performs one provider call per invocation
  - input/output schemas are explicit and validated
  - structured output includes intent, status, assistant message, and requested tool shape
  - limits such as input size are enforced
  - provider credentials resolve only through allowed env vars
  - a deterministic provider conformance harness exists for the initial adapter contract, covering success, malformed responses, error normalization, and tool-request shaping

#### WU-07 — Governed Orchestration Integration

- Type: `feature`
- Outcome: connect the turn tool to dynamic policy gating and host-driven orchestration
- Dependencies: `WU-03`, `WU-06`
- Sizing:
  - `estimated_files: 15`
  - `estimated_tool_calls: 85`
  - `strategy: checkpoint-resume`
- Acceptance:
  - `policy_factory` implements intent-based allow / deny / approval-required behavior
  - reference orchestration loop exists for MCP / HTTP / programmatic callers
  - host composition example exists for memory / task context, with optional sidekick-compatible adapter guidance but no hard dependency on sidekick internals
  - end-to-end tests prove denied-tool recovery and approval flow
  - tool catalog trust-boundary is documented

### Phase 3 — Runtime Expansion

#### WU-08 — Config-Aware Capability Resolution

- Type: `feature`
- Outcome: remove the static manifest-only provider limitation
- Dependencies: `WU-02`, `WU-05`, `WU-06`
- Sizing:
  - `estimated_files: 12`
  - `estimated_tool_calls: 65`
  - `strategy: checkpoint-resume`
- Acceptance:
  - tool capability resolution can merge config-derived scopes
  - provider hosts can come from resolved model profiles
  - config-derived env allowlists are supported where appropriate
  - workspace/lane scope intersection still tightens final network access

#### WU-09 — Policy-Aware Tool Filtering and Auto-Discovery

- Type: `feature`
- Outcome: let the pack discover only the tools actually allowed for a given execution context
- Dependencies: `WU-03`, `WU-07`, `WU-08`
- Sizing:
  - `estimated_files: 11`
  - `estimated_tool_calls: 60`
  - `strategy: checkpoint-resume`
- Acceptance:
  - kernel exposes a policy-aware tool-filtering API
  - filtering applies scope intersection plus policy evaluation for an execution context and intent
  - pack can build its own tool catalog without trusting a host-supplied list
  - tests prove filtered lists differ from raw registry lists when policies tighten access

#### WU-10 — Streaming Turns with Evidence Support

- Type: `feature`
- Outcome: add streaming provider turns with explicit streaming evidence primitives
- Dependencies: `WU-06`, `WU-08`
- Sizing:
  - `estimated_files: 15`
  - `estimated_tool_calls: 85`
  - `strategy: checkpoint-resume`
- Acceptance:
  - provider streaming is supported for `agent:execute-turn`
  - evidence model can represent streaming lifecycle safely, including partial and final turn traces
  - partial and final streaming outputs are auditable
  - non-streaming behavior remains unchanged

#### WU-11 — Multi-Provider Adapter Layer

- Type: `feature`
- Outcome: support multiple provider families behind stable pack contracts
- Dependencies: `WU-06`, `WU-08`
- Sizing:
  - `estimated_files: 13`
  - `estimated_tool_calls: 70`
  - `strategy: checkpoint-resume`
- Acceptance:
  - pack supports more than one provider adapter family
  - adapter selection is config-driven
  - request / response normalization remains internal to the pack
  - tests cover provider-specific edge cases and shared contract invariants

### Phase 4 — Full Orchestration

#### WU-12 — Workflow State and Linear Suspend / Resume

- Type: `feature`
- Outcome: give the pack owned state and resumable execution for long-running sessions
- Dependencies: `WU-07`
- Sizing:
  - `estimated_files: 16`
  - `estimated_tool_calls: 90`
  - `strategy: checkpoint-resume`
- Acceptance:
  - pack persists agent workflow state in scoped storage
  - suspend / resume works for linear multi-turn execution
  - suspended and resumed runs remain `agent-session` executions rather than a new task type
  - resumptions and approval pauses preserve evidence lineage and policy behavior
  - evidence model records resumptions and approval-driven continuation coherently
  - host-driven loop remains compatible

#### WU-13 — DAG Branching and Routine Scheduling

- Type: `feature`
- Outcome: complete the orchestration layer with branching, joins, and scheduled agent routines
- Dependencies: `WU-09`, `WU-12`
- Sizing:
  - `estimated_files: 18`
  - `estimated_tool_calls: 95`
  - `strategy: checkpoint-resume`
- Acceptance:
  - workflow model supports branching and joining
  - scheduled routines are supported as pack-owned `agent-session` orchestration, not as a separate execution class
  - routine execution preserves kernel policy and evidence semantics
  - scheduled wakeups and workflow finalization are represented coherently in evidence/state transitions
  - docs define what is kernel-owned vs pack-owned in orchestration

#### WU-14 — Final Public Docs, Examples, and Positioning

- Type: `documentation`
- Outcome: publish the finished pack story and usage guidance after implementation stabilizes
- Dependencies: `WU-07`, `WU-09`, `WU-10`, `WU-11`, `WU-13`
- Sizing:
  - `estimated_files: 16`
  - `estimated_tool_calls: 45`
  - `strategy: single-session`
- Acceptance:
  - public docs explain installation, configuration, provider setup, orchestration, governance, and limitations
  - examples cover host-driven turns, auto-discovery, streaming, and workflows
  - positioning language is accurate: LumenFlow governs agent execution rather than replacing every model SDK concern
  - ADR and final docs cross-link correctly in arc42 layout

## Dependency Summary

Critical path:

- `WU-01 -> WU-02 -> {WU-03, WU-04} -> WU-05 -> WU-06 -> WU-07 -> WU-12 -> WU-13 -> WU-14`

WU-05 gates on both WU-03 and WU-04 completing. The critical path runs through whichever of those two finishes last.

Parallelizable windows:

- `WU-03` and `WU-04` can proceed in parallel after `WU-02`
- `WU-08` can proceed after the core pack exists (`WU-05`, `WU-06`)
- `WU-09` can proceed after `WU-07` and `WU-08`
- `WU-10` and `WU-11` can proceed in parallel after `WU-06` and `WU-08`

## Why This Split Is Valid

These WUs are not phase-splitting for its own sake. Each WU has an independently reviewable outcome:

- ADR can land before any code
- pack config plumbing is valuable on its own and required by later work
- policy substrate and sandbox hardening are separable kernel concerns
- core pack scaffold and `agent:execute-turn` are meaningful without later orchestration features
- config-aware capability resolution, tool filtering, streaming, and multi-provider support can ship independently
- linear suspend/resume is useful before full DAG orchestration

That keeps the initiative cohesive while respecting the sizing guide.

## Verification Strategy

- runtime startup tests for pack config extraction and `config_schema` validation
- manifest / loader tests for `policy_factory`, `approval_required`, and `required_env`
- sandbox tests for `--clearenv` and explicit env allowlisting
- policy tests for intent-based tool gating and approval flows
- tool capability tests for static and config-derived network scopes
- tool filtering tests comparing raw registry results vs policy-aware filtered results
- `agent:execute-turn` tests for structured output, malformed provider responses, missing credentials, and limit enforcement
- end-to-end orchestration tests for denied-tool recovery, approval gating, suspend/resume, branching, and routine scheduling
- evidence assertions for turn execution, tool execution, streaming traces, resumptions, approval pauses, and scheduled wakeups

## Delivery Notes

- Do not collapse this back into one flat WU. The kernel prerequisites, pack implementation, provider/runtime expansion, and orchestration layer are independently shippable and have different risk profiles.
- Do not split further by artifact type. Tests and docs should travel with each WU unless there is a separate documentation product outcome, as in `WU-01` and `WU-14`.
- If any workflow WU grows beyond its current estimate during implementation, re-check cohesion before splitting again.

## Task Import Appendix

Use this appendix when turning the brief into actual task records.

- Replace `INIT-REPLACE` and `WU-REPLACE-*` with real globally assigned IDs.
- Replace `<YYYY-MM-DD>` and `<owner>` before import.
- Re-validate ADR/doc paths and OSS code-path roots in the target OSS repo before creating the records there.
- Keep Sidekick-related guidance architectural only unless the target OSS repo explicitly documents the same boundary there.

### Proposed Initiative Spec

```yaml
id: INIT-REPLACE
slug: governed-agent-runtime-pack
title: Governed Agent Runtime Pack
description: >-
  Deliver a full governed agent-runtime pack for LumenFlow: ADR-first architectural
  definition, kernel prerequisites for pack config and policy-driven tool gating,
  sandboxed credential handling, provider-neutral model turn execution,
  policy-aware tool discovery, streaming, multi-provider adapters, and
  pack-owned agent-session orchestration including suspend/resume, branching,
  and scheduled routines, while keeping Sidekick intentionally small and domain-focused.
status: open
priority: P1
owner: '<owner>'
created: <YYYY-MM-DD>
phases:
  - id: 1
    title: 'Phase 1: ADR and kernel foundations'
    status: pending
  - id: 2
    title: 'Phase 2: Core pack delivery'
    status: pending
  - id: 3
    title: 'Phase 3: Runtime expansion'
    status: pending
  - id: 4
    title: 'Phase 4: Full agent-session orchestration'
    status: pending
success_metrics:
  - ADR defines the agent-runtime architecture boundary, task model, and orchestration cut-line.
  - Kernel runtime supports resolved pack config, manifest-level env allowlisting, and policy_factory-based intent gating.
  - agent-runtime pack provides governed model-turn execution with provider-neutral adapters and evidence-preserving tool use.
  - Runtime supports config-aware provider capability resolution and policy-aware tool filtering.
  - agent-runtime supports streaming, multi-provider adapters, suspend/resume, branching, and scheduled routines inside agent-session.
  - Sidekick remains a small built-in domain pack and does not absorb generic model-turn runtime concerns.
  - Public docs and examples describe the pack accurately without coupling the public initiative to private/cloud internals.
labels:
  - kernel
  - packs
  - agent-runtime
  - governance
related_plan: lumenflow://plans/curried-doodling-puffin.md
```

### Proposed WU Specs

#### WU-REPLACE-01

```yaml
id: WU-REPLACE-01
title: ADR for governed agent-runtime pack
lane: 'Content: Framework Docs'
type: documentation
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - docs/operations/adr/
  - docs/operations/tasks/initiatives/
tests:
  manual:
    - ADR reviewed and approved
  unit: []
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-01.done
dependencies: []
initiative: INIT-REPLACE
phase: 1
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: 'Architecture-first WU. Must settle orchestration boundary and task model before implementation WUs begin.'
requires_review: false
assigned_to: '<owner>'
exposure: documentation
sizing_estimate:
  estimated_files: 6
  estimated_tool_calls: 25
  strategy: single-session
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Write the architecture decision record for the governed agent-runtime pack.
  The ADR must define the kernel vs pack boundary, provider-neutrality, why
  prompt guards are insufficient, where framework-level orchestration ends,
  and how scheduled/resumed/branched execution remains inside the
  agent-session task model.
acceptance:
  - ADR created for the agent-runtime pack in the verified ADR location of the target repo
  - ADR defines kernel vs pack boundary and host-vs-pack orchestration split
  - ADR defines agent-session as the only task model for scheduled and resumed execution
  - ADR cross-links the initiative plan and target docs location
```

#### WU-REPLACE-02

```yaml
id: WU-REPLACE-02
title: Add runtime pack-config plumbing for pinned pack config roots
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/kernel/src/runtime/
  - packages/@lumenflow/kernel/src/pack/
  - packages/@lumenflow/kernel/src/kernel.schemas.ts
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Start runtime with valid and invalid pack config roots and verify startup behavior matches validation outcome
  unit:
    - packages/@lumenflow/kernel/src/__tests__/runtime.test.ts
    - packages/@lumenflow/kernel/src/__tests__/kernel.schemas.test.ts
    - packages/@lumenflow/kernel/src/__tests__/pack-loader.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-02.done
dependencies:
  - WU-REPLACE-01
initiative: INIT-REPLACE
phase: 1
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: 'Core prerequisite WU. Keep it cohesive around runtime pack-config preservation and validation only.'
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 14
  estimated_tool_calls: 70
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Preserve and validate non-kernel pack config during runtime initialization.
  Extract pack-owned config roots from raw workspace YAML, validate them against
  declared config_schema where present, and attach resolved pack config to loaded
  pack state for later policy and capability resolution.
acceptance:
  - Runtime extracts config for pinned packs with config_key from raw workspace YAML
  - config_schema validation runs during runtime startup
  - Resolved pack config is attached to loaded pack state
  - Invalid pack config fails startup cleanly
  - Packs without config_key remain unaffected
```

#### WU-REPLACE-03

```yaml
id: WU-REPLACE-03
title: Extend kernel policy substrate for governed agent turns
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/kernel/src/policy/policy-engine.ts
  - packages/@lumenflow/kernel/src/runtime/kernel-runtime.ts
  - packages/@lumenflow/kernel/src/pack/manifest.ts
  - packages/@lumenflow/kernel/src/pack/pack-loader.ts
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Start runtime with a valid and invalid policy_factory and verify startup-blocking behavior
  unit:
    - packages/@lumenflow/kernel/src/__tests__/policy-engine.test.ts
    - packages/@lumenflow/kernel/src/__tests__/runtime.test.ts
    - packages/@lumenflow/kernel/src/__tests__/pack-manifest.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-03.done
dependencies:
  - WU-REPLACE-01
  - WU-REPLACE-02
initiative: INIT-REPLACE
phase: 1
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 12
  estimated_tool_calls: 65
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Add the policy features required for intent-gated agent turns:
  manifest-level approval_required support, execution_metadata propagation into
  PolicyEvaluationContext, and policy_factory loading with startup-blocking validation.
acceptance:
  - approval_required is supported in manifest-authored policies
  - execution_metadata reaches PolicyEvaluationContext
  - manifest supports policy_factory
  - policy_factory loads with resolved pack config
  - invalid or missing factory wiring fails startup instead of failing open
```

#### WU-REPLACE-04

```yaml
id: WU-REPLACE-04
title: Tighten sandbox credential passthrough with required_env allowlists
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/kernel/src/sandbox/
  - packages/@lumenflow/kernel/src/pack/manifest.ts
  - packages/@lumenflow/kernel/src/runtime/
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Run a sandboxed tool with declared and undeclared env vars and verify only declared vars pass through
  unit:
    - packages/@lumenflow/kernel/src/__tests__/sandbox.test.ts
    - packages/@lumenflow/kernel/src/__tests__/pack-manifest.test.ts
    - packages/@lumenflow/kernel/src/__tests__/runtime.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-04.done
dependencies:
  - WU-REPLACE-01
  - WU-REPLACE-02
initiative: INIT-REPLACE
phase: 1
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 10
  estimated_tool_calls: 50
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Harden subprocess execution for provider credentials by adding manifest-level
  required_env declarations, clearing ambient env for sandboxed tools, and
  allowing only explicitly declared env vars to pass through.
acceptance:
  - required_env is supported on pack tool declarations
  - sandbox uses clearenv semantics before re-adding approved vars
  - runtime cross-validates pack-config env references against required_env
  - tests prove undeclared env vars do not leak into tool execution
```

#### WU-REPLACE-05

```yaml
id: WU-REPLACE-05
title: Scaffold agent-runtime pack contract and config schema
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Run pack validation for agent-runtime and verify manifest/import-boundary checks pass
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/manifest.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-05.done
dependencies:
  - WU-REPLACE-01
  - WU-REPLACE-02
  - WU-REPLACE-03
  - WU-REPLACE-04
initiative: INIT-REPLACE
phase: 2
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 12
  estimated_tool_calls: 45
  strategy: single-session
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Create the initial agent-runtime pack structure including manifest, constants,
  types, config schema, package wiring, and static provider allowlist baseline.
acceptance:
  - agent-runtime pack folder and manifest contract exist
  - manifest declares task_types: ['agent-session']
  - config schema covers models, intents, and limits
  - initial provider network scopes use static manifest allowlists
  - pack validation passes
```

#### WU-REPLACE-06

```yaml
id: WU-REPLACE-06
title: Implement agent:execute-turn and adapter conformance harness
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/tool-impl/
  - packages/@lumenflow/packs/agent-runtime/manifest.ts
  - packages/@lumenflow/packs/agent-runtime/manifest.yaml
  - packages/@lumenflow/packs/agent-runtime/__tests__/
tests:
  manual:
    - Execute a valid turn against a test provider endpoint and verify structured output plus governed failure behavior
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/tools.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/provider-conformance.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-06.done
dependencies:
  - WU-REPLACE-04
  - WU-REPLACE-05
initiative: INIT-REPLACE
phase: 2
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 14
  estimated_tool_calls: 80
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Implement the core governed model-turn tool, agent:execute-turn, using a
  provider-neutral compatible chat-turn adapter over built-in fetch.
  Add a deterministic provider conformance harness early so adapter behavior
  stays testable before streaming and multi-provider work lands.
acceptance:
  - agent:execute-turn performs one provider call per invocation
  - input and output schemas are explicit and validated
  - turn output includes intent, status, assistant message, and requested tool shape
  - input-size and related limits are enforced
  - provider credentials resolve only through approved env vars
  - deterministic provider conformance tests cover success, malformed responses, error normalization, and tool-request shaping
```

#### WU-REPLACE-07

```yaml
id: WU-REPLACE-07
title: Integrate governed orchestration loop and intent policy routing
lane: 'Framework: CLI Orchestration'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/mcp/
  - apps/docs/src/content/docs/kernel/
tests:
  manual:
    - Run a host-driven turn loop where a disallowed tool request is denied and the next turn recovers cleanly
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/tools.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/policy-routing.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-07.done
dependencies:
  - WU-REPLACE-03
  - WU-REPLACE-06
initiative: INIT-REPLACE
phase: 2
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 15
  estimated_tool_calls: 85
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Connect agent:execute-turn to dynamic intent-based policy routing and provide
  a reference host-driven orchestration loop for MCP, HTTP, or programmatic callers.
  Keep the example host-oriented rather than coupling the public initiative to sidekick internals.
acceptance:
  - policy_factory implements intent-based allow, deny, and approval-required behavior
  - a reference host-driven orchestration loop exists
  - host composition example exists for memory/task context without hard sidekick dependency
  - end-to-end tests prove denied-tool recovery and approval flow
  - tool catalog trust boundary is documented
```

#### WU-REPLACE-08

```yaml
id: WU-REPLACE-08
title: Add config-aware provider capability resolution
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/kernel/src/runtime/
  - packages/@lumenflow/kernel/src/pack/
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Start runtime with provider hostnames in model profiles and verify effective network scopes reflect config plus workspace/lane tightening
  unit:
    - packages/@lumenflow/kernel/src/__tests__/runtime.test.ts
    - packages/@lumenflow/kernel/src/__tests__/pack-loader.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/manifest.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-08.done
dependencies:
  - WU-REPLACE-02
  - WU-REPLACE-05
  - WU-REPLACE-06
initiative: INIT-REPLACE
phase: 3
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 12
  estimated_tool_calls: 65
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Extend capability resolution so agent-runtime provider access can be derived
  from resolved model profiles instead of only static manifest allowlists.
acceptance:
  - capability resolution merges config-derived scopes
  - provider hosts can come from resolved model profiles
  - config-derived env allowlists are supported where appropriate
  - workspace and lane scope intersection still tightens final access
```

#### WU-REPLACE-09

```yaml
id: WU-REPLACE-09
title: Add policy-aware tool filtering and pack auto-discovery
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P1
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/kernel/src/tool-host/
  - packages/@lumenflow/kernel/src/runtime/
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Compare raw registry listing vs filtered tool listing for an intent-constrained execution context
  unit:
    - packages/@lumenflow/kernel/src/__tests__/tool-host.test.ts
    - packages/@lumenflow/kernel/src/__tests__/runtime.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/tool-filtering.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-09.done
dependencies:
  - WU-REPLACE-03
  - WU-REPLACE-07
  - WU-REPLACE-08
initiative: INIT-REPLACE
phase: 3
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 11
  estimated_tool_calls: 60
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Expose a policy-aware tool filtering API so the pack can discover only the
  tools actually available for a specific execution context and intent instead
  of relying on raw registry enumeration or a host-supplied catalog.
acceptance:
  - kernel exposes a policy-aware tool-filtering API
  - filtering applies scope intersection and policy evaluation for context plus intent
  - agent-runtime can build its own filtered tool catalog
  - tests prove filtered results differ from raw registry listing when policy tightens access
```

#### WU-REPLACE-10

```yaml
id: WU-REPLACE-10
title: Add streaming turn execution with evidence-preserving traces
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P2
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/kernel/src/evidence/
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Stream a turn from a test provider and verify both partial and final traces are recorded as expected
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/streaming.test.ts
    - packages/@lumenflow/kernel/src/__tests__/evidence-store.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-10.done
dependencies:
  - WU-REPLACE-06
  - WU-REPLACE-08
initiative: INIT-REPLACE
phase: 3
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 15
  estimated_tool_calls: 85
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Add streaming provider support for agent turns and extend evidence behavior
  so streaming lifecycle events remain auditable without regressing non-streaming turns.
acceptance:
  - agent:execute-turn supports provider streaming
  - evidence model safely represents partial and final streaming output
  - non-streaming turns are unaffected
  - streaming tests cover partial, final, and error paths
```

#### WU-REPLACE-11

```yaml
id: WU-REPLACE-11
title: Add multi-provider adapter layer to agent-runtime
lane: 'Framework: Core Lifecycle'
type: feature
status: ready
priority: P2
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/packs/agent-runtime/__tests__/
tests:
  manual:
    - Run representative turns against at least two adapter families and verify normalized behavior
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/provider-conformance.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/tools.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-11.done
dependencies:
  - WU-REPLACE-06
  - WU-REPLACE-08
initiative: INIT-REPLACE
phase: 3
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 13
  estimated_tool_calls: 70
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Add multiple provider adapter families behind the stable agent-runtime turn
  contract while keeping provider-specific request and response normalization internal.
acceptance:
  - more than one provider adapter family is supported
  - adapter selection is config-driven
  - normalized turn contracts remain stable across providers
  - shared adapter conformance tests and provider-specific edge-case tests pass
```

#### WU-REPLACE-12

```yaml
id: WU-REPLACE-12
title: Add agent-session workflow state and linear suspend-resume
lane: 'Framework: CLI Orchestration'
type: feature
status: ready
priority: P2
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/kernel/src/event-store/
  - packages/@lumenflow/kernel/src/__tests__/
tests:
  manual:
    - Suspend a linear multi-turn agent-session and resume it in a later execution without losing policy or evidence behavior
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/workflow-state.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/resume.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-12.done
dependencies:
  - WU-REPLACE-07
initiative: INIT-REPLACE
phase: 4
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 16
  estimated_tool_calls: 90
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Add pack-owned workflow state and linear suspend/resume for long-running
  agent-session execution while preserving evidence lineage, policy evaluation,
  and compatibility with the host-driven orchestration loop.
acceptance:
  - pack persists workflow state in scoped storage
  - suspend and resume work for linear multi-turn execution
  - suspended and resumed runs remain agent-session executions
  - evidence lineage and policy behavior are preserved across resume and approval pauses
```

#### WU-REPLACE-13

```yaml
id: WU-REPLACE-13
title: Add branching, joins, and scheduled routines to agent-session orchestration
lane: 'Framework: CLI Orchestration'
type: feature
status: ready
priority: P2
created: <YYYY-MM-DD>
code_paths:
  - packages/@lumenflow/packs/agent-runtime/
  - packages/@lumenflow/packs/agent-runtime/__tests__/
  - apps/docs/src/content/docs/kernel/
tests:
  manual:
    - Run a branching agent-session routine with at least one scheduled path and verify state, evidence, and policy behavior remain correct
  unit:
    - packages/@lumenflow/packs/agent-runtime/__tests__/workflow-dag.test.ts
    - packages/@lumenflow/packs/agent-runtime/__tests__/routine-scheduling.test.ts
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-13.done
dependencies:
  - WU-REPLACE-09
  - WU-REPLACE-12
initiative: INIT-REPLACE
phase: 4
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: ''
requires_review: false
assigned_to: '<owner>'
exposure: backend-only
sizing_estimate:
  estimated_files: 18
  estimated_tool_calls: 95
  strategy: checkpoint-resume
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Complete pack-owned agent-session orchestration with branching, joining,
  and scheduled routines while keeping routine execution inside the agent-session
  task model rather than introducing a separate execution class.
acceptance:
  - workflow model supports branching and joining
  - scheduled routines run as agent-session orchestration, not a separate task class
  - routine execution preserves kernel policy and evidence semantics
  - evidence and state transitions cover scheduled wakeups and workflow finalization coherently
  - docs define what remains kernel-owned vs pack-owned in orchestration
```

#### WU-REPLACE-14

```yaml
id: WU-REPLACE-14
title: Publish final docs and examples for the governed agent-runtime pack
lane: 'Content: Framework Docs'
type: documentation
status: ready
priority: P2
created: <YYYY-MM-DD>
code_paths:
  - apps/docs/src/content/docs/kernel/
  - packages/@lumenflow/packs/agent-runtime/README.md
  - docs/operations/adr/
tests:
  manual:
    - Build or preview docs and verify installation, configuration, orchestration, and example links resolve correctly
  unit: []
  e2e: []
artifacts:
  - .lumenflow/stamps/WU-REPLACE-14.done
dependencies:
  - WU-REPLACE-07
  - WU-REPLACE-09
  - WU-REPLACE-10
  - WU-REPLACE-11
  - WU-REPLACE-13
initiative: INIT-REPLACE
phase: 4
spec_refs:
  - lumenflow://plans/curried-doodling-puffin.md
risks: []
notes: 'Documentation-only closing WU after implementation stabilizes.'
requires_review: false
assigned_to: '<owner>'
exposure: documentation
sizing_estimate:
  estimated_files: 16
  estimated_tool_calls: 45
  strategy: single-session
escalation_triggers: []
requires_human_escalation: false
requires_cso_approval: false
requires_cto_approval: false
requires_design_approval: false
description: >-
  Publish final public documentation and examples for the governed agent-runtime pack,
  including installation, configuration, provider setup, streaming, orchestration,
  and accurate positioning language.
acceptance:
  - public docs cover installation, configuration, provider setup, orchestration, and governance
  - examples cover host-driven turns, auto-discovery, streaming, and workflows
  - positioning language accurately describes LumenFlow as governing agent execution rather than replacing every SDK concern
  - ADR and public docs cross-link correctly in the target repo
```
