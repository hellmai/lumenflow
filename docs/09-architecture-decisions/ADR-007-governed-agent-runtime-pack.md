# ADR-007: Governed Agent Runtime Pack

**Status:** Proposed  
**Date:** 2026-03-12  
**Authors:** Tom @ HellmAI  
**WU:** WU-2406  
**Initiative:** INIT-52

## Context

LumenFlow already has the core governance substrate needed for controlled agent execution:

- scope intersection
- deny-wins policy evaluation
- evidence receipts
- sandboxed subprocess execution

What it does not yet have is a dedicated pack boundary for governed model turns, provider integration, and `agent-session` orchestration.

That gap creates three architectural risks:

1. Generic model-turn concerns could drift into the `sidekick` pack, broadening a pack that is meant to stay domain-focused.
2. Policy decisions could be pushed upward into prompts or ad hoc host logic instead of staying in the kernel's enforcement path.
3. Scheduled, resumed, and branched agent execution could grow a shadow task model instead of reusing one coherent execution class.

The initiative in [INIT-52](../04-operations/tasks/initiatives/INIT-52.yaml) needs a firm architectural boundary before kernel and pack work begins. That boundary must define:

- why `agent-runtime` is a separate pack
- what belongs in the kernel versus the pack
- where framework-level orchestration stops
- how long-running agent execution stays inside `agent-session`

## Decision

Create a separate `agent-runtime` pack as the governed runtime for agent execution in LumenFlow.

The pack is centered on `agent:execute-turn` as the core public tool surface. It owns model-turn semantics, provider adapter normalization, and `agent-session` workflow state. It does not replace kernel governance and it does not expand `sidekick` into a generic model runtime.

### Key Principles

1. **Kernel enforcement remains authoritative**

   The kernel continues to own policy evaluation, scope intersection, evidence recording, and sandbox enforcement. Tool gating and approval behavior must be enforced through kernel policy, not prompt instructions.

2. **`agent-runtime` owns governed turn semantics**

   The pack owns the turn contract, adapter normalization, workflow state, and `agent-session` orchestration behavior. The pack does not own generic framework orchestration outside its domain.

3. **`sidekick` remains separate and domain-focused**

   `sidekick` continues to own its domain primitives. Generic model-turn execution and agent orchestration are not added to its built-in core.

4. **Provider integration stays provider-neutral**

   The pack uses provider-neutral adapters and must not take a hard runtime dependency on external AI SDKs. Provider behavior is normalized behind pack-controlled contracts.

5. **`agent-session` is the only task model**

   Scheduled, resumed, and branched executions remain `agent-session` executions. The initiative does not introduce separate runtime task classes for routines or workflows.

6. **Pack-owned orchestration has a clear cut-line**

   Framework-level orchestration remains outside the pack. Pack-owned orchestration is limited to `agent-session` domain flows such as suspend/resume, branching, and scheduled wakeups once the required kernel substrate exists.

7. **Delivery remains phased**

   Delivery proceeds through kernel foundations, core runtime, runtime expansion, and full `agent-session` orchestration as defined in [INIT-52-plan](../04-operations/plans/INIT-52-plan.md).

## Consequences

### Positive

- Establishes a clear boundary between kernel governance, pack-owned execution, and host/framework orchestration.
- Prevents `sidekick` from becoming an overloaded catch-all pack for unrelated runtime concerns.
- Preserves kernel-enforced policy and evidence guarantees for agent execution.
- Keeps provider integration replaceable and pack-controlled.
- Keeps long-running agent behavior inside one execution model, which simplifies evidence, policy, and replay semantics.

### Trade-offs

- Requires kernel work before the pack can be fully delivered, especially around runtime pack config, policy hooks, env allowlisting, and richer evidence support.
- Introduces a multi-phase implementation path rather than one short feature drop.
- Keeps some orchestration responsibility in the host layer until pack-owned `agent-session` orchestration is delivered.

### Mitigations

- Sequence the work through the WUs defined in [INIT-52](../04-operations/tasks/initiatives/INIT-52.yaml) so kernel prerequisites land before pack features that depend on them.
- Add an adapter conformance harness early so provider behavior stays testable as the pack expands.
- Keep the orchestration boundary explicit in docs and future ADR updates so later work does not reintroduce task-model drift.

## Alternatives Considered

### Extend `sidekick` instead of creating `agent-runtime`

Rejected. `sidekick` should remain a small, domain-focused pack. Folding generic model turns and orchestration into it would blur pack boundaries and make future governance decisions harder to isolate.

### Keep all orchestration host-owned

Rejected. Host-driven orchestration is appropriate early, but long-running `agent-session` behavior such as suspend/resume, branching, and scheduled wakeups belongs in the pack once the kernel substrate exists.

### Introduce separate task types for routines or workflows

Rejected. A second task model would duplicate lifecycle, evidence, and replay semantics. Scheduled and resumed execution remain modes of `agent-session`.

### Bind the pack to a single external SDK surface

Rejected. A hard runtime dependency on an external SDK would shape the pack boundary around a third-party abstraction rather than the governed turn contract owned by LumenFlow.

## References

- [ADR Index](README.md)
- [INIT-52 Initiative](../04-operations/tasks/initiatives/INIT-52.yaml)
- [INIT-52 Plan](../04-operations/plans/INIT-52-plan.md)
- [ADR Template](ADR-000-template.md)
