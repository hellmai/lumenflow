# Control Plane Interface Roadmap

## Objective

Deliver practical interface upgrades in this repo so any control-plane implementation
(self-hosted or managed) can support stronger scheduling, liveness, cost visibility,
and approval workflows with minimal integration friction.

## Outcomes

- Structured cost telemetry plus local `cost:summary` reporting.
- Backward-compatible heartbeat extensions for dynamic cadence and assignment.
- Stronger agent identity context through existing session contracts.
- Approval API wrappers that align with existing WU escalation behavior.

## Why this helps adopters

- Faster integration of advanced control-plane features without rewriting local tooling.
- Better operational visibility (cost, liveness, assignment state).
- Lower migration risk via additive wire contracts and stable CLI behavior.
- Clear extension path for teams running local-only, self-hosted, or managed setups.

---

## Compatibility commitments

- Keep `ControlPlaneSyncPort` + HTTP adapter patterns stable.
- Reuse `SignalSyncPort` session registration/listing flows.
- Extend NDJSON append-only telemetry + offset sync, not replace it.
- Preserve existing WU escalation/approval behavior in local workflows.
- Maintain backward compatibility for existing control-plane-sdk consumers.

---

## Capability map (contract side only)

| Capability                          | Contract Surface in this repo                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| Agent liveness + stall signaling    | Extend heartbeat input/result with optional health/scheduling fields            |
| Server-directed dispatch scheduling | Optional heartbeat assignment + next interval fields                            |
| Cost visibility + budget telemetry  | Cost NDJSON source + typed cost records via existing telemetry push path        |
| Agent identity/lifecycle context    | Enrich existing session registration metadata                                   |
| Business approvals                  | Optional control-plane approval APIs + CLI wrappers, aligned with WU escalation |
| Observability surface               | No local implementation; cloud consumes events/telemetry already emitted        |

---

## WU-1: Cost Telemetry Contract (Minimal)

### Objective

Add structured cost telemetry without forking the transport surface.

### Changes

1. Add types in `@lumenflow/metrics/src/types.ts`:
   - `CostEvent`
   - `CostSummary`

2. Extend `@lumenflow/core/src/telemetry.ts`:
   - Add `.lumenflow/telemetry/costs.ndjson`
   - Add `emitCostEvent()`
   - Add `costs` as an additional source in cloud sync loop

3. Reuse existing `pushTelemetry()` in `ControlPlaneSyncPort`:
   - Do not add `pushCostEvents()` in this phase.
   - Encode cost records as telemetry metrics/tags.

4. Add thin CLI:
   - `pnpm cost:summary` from local `costs.ndjson`

### Constraints

- No kernel trigger addition (no `ON_COST_THRESHOLD`).
- No hard-stop policy logic in this WU.

### Candidate files

- `packages/@lumenflow/metrics/src/types.ts`
- `packages/@lumenflow/core/src/telemetry.ts`
- `packages/@lumenflow/cli/src/cost-summary.ts` (new)
- `packages/@lumenflow/cli/src/public-manifest.ts`

### Scope

S (1 WU)

### Acceptance criteria

1. `CostEvent` and `CostSummary` are implemented, exported, and type-checked in `@lumenflow/metrics`.
2. `emitCostEvent()` appends valid NDJSON entries to `costs.ndjson`.
3. Cloud telemetry sync includes `costs` source with offset tracking and no regression to existing sources.
4. `pnpm cost:summary` is registered, has `--help`, and reports aggregated local totals.
5. Tests cover cost event emission, cost sync mapping, and CLI summary behavior.
6. Documentation is updated in relevant docs pages under `apps/docs/src/content/docs/reference/**` and command references in `docs/operations/_frameworks/lumenflow/agent/onboarding/quick-ref-commands.md`.

---

## WU-2: Heartbeat Scheduling + Liveness Extension

### Objective

Enable server-directed cadence and assignment with backward-compatible heartbeat fields.

### Changes

1. Extend `HeartbeatInput` (optional fields only):
   - `agent_id?: string`
   - `wu_id?: string`
   - `health?: { busy?: boolean; stalled?: boolean; last_progress_at?: string }`

2. Extend `HeartbeatResult` (optional fields only):
   - `next_heartbeat_ms?: number`
   - `assignment?: { wu_id: string; action: 'claim' | 'continue' | 'abort'; hint?: string }`
   - `budget_remaining_usd?: number`
   - `coalesced_signals?: number`

3. Add `HeartbeatManager` in `@lumenflow/agent`:
   - Optional dynamic interval from server
   - Coalescing window for duplicate wakeups
   - Single-flight execution lock
   - Reuse existing backoff utility

### Candidate files

- `packages/@lumenflow/control-plane-sdk/src/sync-port.ts`
- `packages/@lumenflow/control-plane-sdk/src/http/http-control-plane-sync-port.ts`
- `packages/@lumenflow/control-plane-sdk/src/mock/mock-control-plane-sync-port.ts`
- `packages/@lumenflow/agent/src/agent-heartbeat.ts` (new)
- `packages/@lumenflow/agent/src/auto-session-integration.ts`

### Scope

M (1-2 WUs)

### Acceptance criteria

1. Heartbeat contract extensions are additive and optional (no breaking changes to existing consumers).
2. HTTP control-plane adapter and mock implementations support new heartbeat fields.
3. `HeartbeatManager` handles server-directed interval, coalescing, and single-flight execution lock.
4. Failure handling/backoff behavior is covered by tests and aligned with existing retry utilities.
5. Documentation is updated for heartbeat contract changes in relevant reference docs (including `apps/docs/src/content/docs/reference/api.mdx` or equivalent contract pages).

---

## WU-3: Agent Identity via Existing Session Contracts

### Objective

Support lifecycle/state attribution without creating a parallel registry surface in this phase.

### Changes

1. Reuse `SignalSyncPort.registerSession/listSessions/deregisterSession`.

2. Standardize metadata keys sent during session registration:
   - `client_type`
   - `capabilities`
   - `agent_version`
   - `host_id`

3. Wire metadata in auto-session integration path.

### Constraints

- No new `agents.json` registry in this phase.
- No new `registerAgent()/updateAgentStatus()` in this phase unless cloud proves a hard need.

### Candidate files

- `packages/@lumenflow/control-plane-sdk/src/signal-sync-port.ts` (types/docs only if needed)
- `packages/@lumenflow/agent/src/auto-session-integration.ts`
- `packages/@lumenflow/agent/src/agent-session.ts` (if metadata persistence is needed)

### Scope

S-M (1 WU)

### Acceptance criteria

1. Session registration consistently includes standardized agent identity metadata keys.
2. Metadata propagation is wired through auto-session integration and observable via session listing.
3. No parallel local agent registry is introduced in this phase.
4. Tests cover metadata serialization, registration, and retrieval paths.
5. Documentation is updated in relevant integration/reference docs under `apps/docs/src/content/docs/reference/**`.

---

## WU-4: Business Approval Contract Alignment (No Duplication)

### Objective

Expose cloud approval workflows without duplicating kernel approval state machines locally.

### Changes

1. Optional control-plane approval API types/methods:
   - `requestApproval`
   - `resolveApproval`
   - `listApprovals`

2. Thin CLI wrappers:
   - `approval:request`
   - `approval:review`
   - `approval:list`

3. Map CLI behavior to existing WU escalation semantics where possible.

### Constraints

- No new kernel event kinds for business approvals in this phase.
- No new local approval state machine in kernel.
- Existing WU escalation remains the authoritative local gate.

### Candidate files

- `packages/@lumenflow/control-plane-sdk/src/sync-port.ts`
- `packages/@lumenflow/control-plane-sdk/src/http/http-control-plane-sync-port.ts`
- `packages/@lumenflow/cli/src/public-manifest.ts`
- `packages/@lumenflow/cli/src/approval-request.ts` (new)
- `packages/@lumenflow/cli/src/approval-review.ts` (new)
- `packages/@lumenflow/cli/src/approval-list.ts` (new)

### Scope

M (1 WU)

### Acceptance criteria

1. Approval API contract methods are added as optional control-plane extensions (non-breaking).
2. HTTP adapter implementation exists for approval contract methods.
3. `approval:request`, `approval:review`, and `approval:list` CLI wrappers are registered and documented with `--help`.
4. Existing local WU escalation gate behavior remains unchanged.
5. Tests cover approval SDK methods and CLI wrapper behavior (including cloud-unavailable failure paths).
6. Documentation is updated in CLI/reference docs under `apps/docs/src/content/docs/reference/**` and command references in `docs/operations/_frameworks/lumenflow/agent/onboarding/quick-ref-commands.md`.

---

## Implementation order

```
Phase 1 (parallel):
  WU-1 Cost Telemetry Contract
  WU-2 Heartbeat Scheduling + Liveness Extension

Phase 2 (sequential):
  WU-3 Agent Identity via Existing Session Contracts
  WU-4 Business Approval Contract Alignment
```

Total expected in this repo: **4 WUs** (contract + thin-client only).

---

## Verification criteria

### Compatibility

- Existing SDK consumers continue working unchanged.
- All new wire fields are optional.
- Existing heartbeat and telemetry call paths remain valid.

### Quality gates

- `pnpm gates` passes.
- Unit tests for new types and adapters.
- HTTP adapter tests cover new optional fields and methods.
- CLI commands expose `--help` and fail cleanly when cloud endpoints are unavailable.

### Smoke tests

1. Emit `CostEvent` -> append to `costs.ndjson` -> sync via existing telemetry push path.
2. Heartbeat returns `next_heartbeat_ms` + assignment -> client loop updates interval and captures assignment.
3. Session registration includes standardized metadata -> list sessions returns expected identity context.
4. Approval CLI calls control-plane endpoints while local WU escalation gate behavior is unchanged.
