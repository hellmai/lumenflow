# Work Unit Sizing & Strategy Guide

**Purpose:** Decision framework for agents to determine when work should remain one WU, when it needs a handoff strategy, and when it truly needs decomposition.

**Effective Date:** 2025-11-24 (Post-WU-1215 Analysis)

**Status:** Active — Thresholds are mandatory **strategy triggers**. They are not permission to over-split cohesive work.

---

## 1. Complexity Assessment Matrix

Before claiming a WU, estimate its "weight" using these heuristics.

| Complexity    | Files | Tool Calls | Context Budget | Strategy                                                                                                    |
| :------------ | :---- | :--------- | :------------- | :---------------------------------------------------------------------------------------------------------- |
| **Simple**    | <20   | <50        | <30%           | **Single Session** (Tier 2 Context)                                                                         |
| **Medium**    | 20-50 | 50-100     | 30-50%         | **Checkpoint-Resume** (Standard Handoff)                                                                    |
| **Complex**   | 50+   | 100+       | >50%           | **Orchestrator-Worker** or **Checkpoint-Resume**; split only if non-atomic                                  |
| **Oversized** | 100+  | 200+       | —              | **Re-check cohesion**; split only when the work cannot land as one coherent outcome or no exception applies |

**These thresholds are mandatory strategy triggers.** They exist to prevent context exhaustion and rule loss (WU-1215 failure: 80k tokens consumed on analysis alone, zero implementation). They do **not** mean every Medium or Complex WU should be broken into multiple smaller WUs. Agents operate in context windows and tool calls, not clock time.

### 1.0 Cohesion Rule

**Default bias: one coherent outcome = one WU.**

Keep work in one WU when all of the following are true:

- The acceptance criteria describe one coherent outcome
- The work should land together to be meaningful
- A single agent or handoff chain can finish it with `single-session`, `checkpoint-resume`, or `orchestrator-worker`
- The touched files all support the same change, even if there are several of them

Do **not** split a WU just because:

- It has multiple implementation steps
- Tests, docs, and code all need updates for the same change
- The work may take more than one session
- There are several files in the same lane supporting one atomic outcome

Split a WU only when one of these is true:

- Different parts can ship, review, or roll back independently
- Different lanes or owners should deliver different parts
- A risk-reduction pattern is needed, such as tracer bullet or feature flag
- The work no longer has a clean stopping point and keeps widening during execution

**Required question before splitting:** Can these parts ship, review, and roll back independently? If no, keep one WU and choose a better execution strategy.

**Examples that should usually stay one WU:**

- Add one API endpoint plus its tests and docs
- Implement one dashboard card plus the backend query it depends on in the same lane
- Mechanical import or config rewrites across many files when every change is uniform

**Anti-patterns that should usually stay one WU:**

- "Endpoint first, tests second, docs third" for one API change
- "Backend WU" and "frontend WU" when neither is independently shippable
- "Refactor step 1", "refactor step 2", and "refactor step 3" for one atomic fix
- "Metrics tests WU", "Memory tests WU", "Runtime tests WU" for closing one test coverage gap -- one outcome, one WU
- "Fix bug WU" and "Clean up file where bug was found WU" -- if the cleanup is in the same file, one WU

### 1.0.1 Consolidation Checklist (Mandatory Before Splitting)

Agents consistently under-apply the cohesion rule, defaulting to micro-splitting. Before proposing more than 2 WUs for any body of work, run this checklist:

1. **Same lane?** If two proposed WUs are in the same lane and the same outcome, merge them.
2. **Same file or module?** If two WUs touch the same file, they are almost certainly one WU.
3. **Can either ship alone?** If WU-A is meaningless without WU-B, they are one WU.
4. **Is the split by phase, not outcome?** "Step 1" and "Step 2" of the same fix = one WU.
5. **Is the split by artifact type?** "Tests WU" and "Code WU" for the same feature = one WU.
6. **Would a reviewer see these as one PR?** If yes, one WU.

**Apply this checklist iteratively.** After your first pass at splitting, re-run the checklist. If any merges are possible, merge and re-run again. Stop only when no further merges pass the checklist. Real-world experience shows the first pass typically over-splits by 2-3x.

### 1.1 Documentation-Only Exception

Documentation WUs (`type: documentation`) have relaxed file count thresholds because:

- Doc files have lower cognitive complexity than code
- No test/type/lint dependencies to track
- Changes are typically additive, not structural

| Complexity  | Files (docs) | Tool Calls | Context Budget | Strategy          |
| :---------- | :----------- | :--------- | :------------- | :---------------- |
| **Simple**  | <40          | <50        | <30%           | Single Session    |
| **Medium**  | 40-80        | 50-100     | 30-50%         | Checkpoint-Resume |
| **Complex** | 80+          | 100+       | >50%           | Decomposition     |

**Applies when ALL true:**

- WU `type: documentation`
- Only modifies: `docs/**`, `*.md`, `.lumenflow/stamps/**`
- Does NOT touch: `apps/**`, `packages/**`, `tools/**` (code paths)

**Example: Docs-only WU touching 35 markdown files**

```yaml
# WU-XXX.yaml
id: WU-XXX
type: documentation
code_paths:
  - docs/04-operations/_frameworks/lumenflow/*.md
  - docs/01-product/*.md
```

This is allowed under docs exception: 35 files < 40 threshold for Simple.

---

### 1.2 Shallow Multi-File Exception

Some WUs touch many files but make shallow, uniform changes (e.g., renaming, search-replace, config updates). These may exceed file count thresholds while remaining low-complexity.

**Single-session override allowed when ALL true:**

1. **Uniform change pattern**: Same edit repeated across files (e.g., rename, import path update, config value change)
2. **No structural changes**: No new functions, classes, or control flow
3. **Low cognitive load**: Each file change is <=5 lines and mechanically identical
4. **Justification documented**: WU notes explain why thresholds are exceeded

**Example: Renaming a module across 45 files**

```yaml
# WU YAML notes field
notes: |
  Single-session override: 45 files modified but all are mechanical
  import path updates from '@old/path' to '@new/path'. Each change is
  1 line, pattern is identical across all files. No structural changes.
  Complexity: Low (uniform search-replace).
```

**Counter-example (NOT eligible for override):**

A WU touching 30 files where each requires unique logic changes, test updates, or structural modifications. This is Complex, not shallow multi-file - standard thresholds apply.

---

### 1.3 Examples Summary

| WU Type                     | Files | Eligible for Override? | Reasoning                                      |
| :-------------------------- | :---- | :--------------------- | :--------------------------------------------- |
| Docs: update 25 markdown    | 25    | Yes (docs exception)   | <40 files, docs-only, low complexity           |
| Docs: reorg 60 doc files    | 60    | Yes (docs exception)   | <80 files = Medium, checkpoint-resume strategy |
| Code: rename import in 45   | 45    | Yes (shallow override) | Uniform 1-line changes, no structural edits    |
| Code: refactor 30 files     | 30    | No                     | Each file has unique logic changes             |
| Code: add feature across 25 | 25    | No                     | Exceeds 20-file threshold, structural changes  |
| Docs + Code: mixed 15 files | 15    | No                     | Not docs-only, standard code thresholds apply  |

---

### 1.4 Sizing Contract (Tooling-Backed Enforcement) (WU-2141)

The sizing thresholds in sections 1.0-1.2 are now enforced by CLI tooling. The `sizing_estimate` metadata contract lets agents declare their sizing intent at WU creation time, and the tooling validates compliance.

#### The `sizing_estimate` Metadata Contract

WU YAML specs support an optional `sizing_estimate` field. When present, `wu:create` and `wu:brief` validate it against the thresholds above.

**Fields:**

| Field                  | Type   | Required | Description                                               |
| :--------------------- | :----- | :------- | :-------------------------------------------------------- |
| `estimated_files`      | number | Yes      | Estimated number of files to be modified                  |
| `estimated_tool_calls` | number | Yes      | Estimated number of tool calls for the session            |
| `strategy`             | string | Yes      | Execution strategy (see valid values below)               |
| `exception_type`       | string | No       | Exception type when thresholds are intentionally exceeded |
| `exception_reason`     | string | No       | Justification for the exception (required with type)      |

**Valid `strategy` values:**

- `single-session` -- Fits within Simple thresholds
- `checkpoint-resume` -- Medium complexity, requires checkpoint-resume
- `orchestrator-worker` -- Complex, requires orchestrator-worker pattern
- `decomposition` -- Must be split into multiple WUs

**Valid `exception_type` values:**

- `docs-only` -- Documentation-only exception (section 1.1)
- `shallow-multi-file` -- Shallow multi-file exception (section 1.2)

#### Example: Compliant WU with sizing metadata

```yaml
# WU-XXX.yaml
id: WU-XXX
type: feature
sizing_estimate:
  estimated_files: 8
  estimated_tool_calls: 35
  strategy: single-session
```

#### Example: Oversize WU with exception metadata

```yaml
# WU-XXX.yaml
id: WU-XXX
type: documentation
sizing_estimate:
  estimated_files: 45
  estimated_tool_calls: 40
  strategy: single-session
  exception_type: docs-only
  exception_reason: >
    All markdown documentation files. Low cognitive complexity,
    no test/type/lint dependencies.
```

#### Example: Shallow multi-file exception

```yaml
# WU-XXX.yaml
id: WU-XXX
type: refactor
sizing_estimate:
  estimated_files: 45
  estimated_tool_calls: 40
  strategy: single-session
  exception_type: shallow-multi-file
  exception_reason: >
    Uniform import path rename from '@old/path' to '@new/path'.
    Each file change is 1 line, mechanically identical.
```

#### Advisory vs Strict Mode

The tooling operates in two modes:

**Advisory mode (default):** `wu:create` and `wu:brief` emit warnings when an estimate exceeds thresholds without valid exception metadata. The operation still proceeds. This mode preserves backward compatibility -- WUs without `sizing_estimate` produce no warnings.

```
[wu:create] WARNING (WU-100): sizing: estimated_files (30) exceeds Simple
threshold (20). Consider adding exception_type/exception_reason or splitting
the WU. See docs/04-operations/_frameworks/lumenflow/wu-sizing-guide.md.
```

**Strict mode (`--strict-sizing`):** `wu:brief` supports a `--strict-sizing` flag that blocks when:

- `sizing_estimate` metadata is missing from the WU YAML
- The estimate exceeds thresholds without a valid exception

```bash
# Advisory mode (default) -- warns but proceeds
pnpm wu:brief --id WU-XXX --client claude-code

# Strict mode -- blocks non-compliant WUs
pnpm wu:brief --id WU-XXX --client claude-code --strict-sizing
```

Strict mode is intended for teams that want to enforce sizing discipline before delegating work to agents. It is opt-in and does not affect existing workflows.

#### Backward Compatibility

- WUs created before WU-2141 (without `sizing_estimate`) are fully supported
- Missing `sizing_estimate` is treated as "no estimate provided" -- no warnings, no errors
- Advisory mode never blocks WU creation or brief generation
- Strict mode is opt-in via `--strict-sizing` flag only

#### When to Add Sizing Metadata

**Always recommended for:**

- Feature WUs expected to exceed Simple thresholds
- WUs being delegated to agents via `wu:brief`
- Initiative WUs where scope discipline is critical

**Optional for:**

- Simple bug fixes under 10 files
- Documentation WUs under 20 files
- Any WU comfortably within Simple thresholds

---

## 2. Strategy Decision Tree

Use this logic to select your approach. If `git status` ever shows >20 modified files, STOP and re-evaluate cohesion and strategy. Do not auto-split on file count alone. First check the cohesion rule, the required ship/review/rollback question, and the documented exceptions.

```
┌─────────────────────────┐
│   Start WU Analysis     │
└────────────┬────────────┘
             │
             ▼
      ┌──────────────┐
      │ Est. Tool    │
      │ Calls > 50?  │
      └──┬────────┬──┘
         │        │
        No       Yes
         │        │
         ▼        ▼
   ┌─────────┐  ┌────────────────┐
   │Standard │  │ Complexity     │
   │Strategy │  │ Type?          │
   │(Tier 2) │  └──┬──────────┬──┘
   └─────────┘     │          │
                   │          │
           Single Domain   Multi-Domain
           Clear Phases    High Coordination
                   │          │
                   ▼          ▼
         ┌──────────────┐  ┌────────────────┐
         │Checkpoint-   │  │ Must Land      │
         │Resume        │  │ Atomically?    │
         │• Investigate │  └──┬──────────┬──┘
         │• Implement   │     │          │
         │• Mid-WU      │    Yes        No
         │  Handoff     │     │          │
         └──────────────┘     ▼          ▼
                    ┌──────────────┐ ┌──────────────┐
                    │Orchestrator- │ │Decomposition │
                    │Worker        │ │• Split WUs   │
                    │• Main Agent  │ │• Feature     │
                    │  = Coord.    │ │  Flags       │
                    │• Spawns:     │ │• Dependencies│
                    │  Tester,     │ └──────────────┘
                    │  Guardian,   │
                    │  Coder       │
                    └──────────────┘
```

---

## 3. Splitting Patterns (Decomposition)

Only use these patterns after you have confirmed the work is no longer one coherent, independently reviewable outcome. Complex does not mean "automatically decompose."

### Pattern A: The Tracer Bullet (Risk Reduction)

**Best for:** New integrations, unproven libraries.

**Strategy:**

- **WU-1:** Define Ports, implement a hardcoded/mock Adapter, write the E2E test. Prove the "walking skeleton" works.
- **WU-2:** Implement the real infrastructure Adapter and logic.

**Example:** Integrating a new LLM provider

- WU-A: Create port interface + mock adapter returning fixed responses + E2E test proving UI can display results
- WU-B: Implement real API adapter with error handling, rate limiting, etc.

**Why:** De-risks unknowns early; proves integration works before investing in full implementation.

---

### Pattern B: The Layer Split (Architectural)

**Best for:** Large backend features following hexagonal architecture.

**Strategy:**

- **WU-1:** Core Domain (Ports + Application). Pure logic, fast unit tests.
- **WU-2:** Infrastructure Adapters + Integration Tests.

**Example:** New data export feature

- WU-A: Port definitions + application use case + unit tests (no external dependencies)
- WU-B: File system adapter + S3 adapter + integration tests

**Why:** Application logic can be reviewed/tested independently; adapters can be implemented in parallel lanes.

---

### Pattern C: The UI/Logic Split (Lane Separation)

**Best for:** Full-stack features requiring heavy frontend work.

**Strategy:**

- **WU-1 (Core Systems):** API endpoints, database schema, backend logic.
- **WU-2 (Experience):** Frontend components, UI state, integration with API.

**Example:** New analytics dashboard widget

- WU-A (Core Systems lane): `/api/dashboard/summary` endpoint + DB queries + API tests
- WU-B (Experience lane): `DashboardSummaryCard` component + state management + E2E tests

**Why:** Enables parallel work across lanes; backend can be tested independently of UI.

---

### Pattern D: The Feature Flag (Phased Rollout)

**Best for:** High-risk refactoring (like WU-1215), breaking changes, gradual migrations.

**Strategy:**

- **WU-1:** Implement new logic behind a `ENABLE_NEW_FLOW=true` flag. Tests run against the flag.
- **WU-2:** Remove the flag and delete old code path.

**Example:** Refactoring a large function (WU-1215 case)

- WU-A: Extract new modular functions, call them behind `USE_NEW_WU_DONE=true`, preserve old `main()` as default
- WU-B: After validation, remove flag and old `main()` implementation

**Why:** Allows incremental delivery with rollback safety; can test new code in production without risk.

---

## 4. Context Safety Triggers

**Heading:** Default Triggers (Deviations require written justification in WU notes)

If you hit ANY of these triggers during a session, you MUST perform a Standard Session Handoff (see [session-handoff.md](./agent/onboarding/session-handoff.md)):

- **Token Limit:** Context usage hits **50% (Warning)** or **80% (Critical)**.
- **Tool Volume:** **50+ tool calls** in current session.
- **File Volume:** **20+ files** modified in `git status`.
- **Session Staleness:** Repeated redundant queries or forgotten context (performance degradation).

**Why these triggers matter:** Ignoring them led to the WU-1215 failure. An agent consumed 40% of context (80k tokens) on analysis alone, violated worktree discipline using absolute paths, and failed to deliver implementation. Preserve your reasoning capability by clearing context before you crash.

**Performance degradation symptoms:**

- Redundant tool calls (re-fetching already retrieved information)
- Lost worktree discipline (edits landing in main instead of worktree)
- Forgotten decisions or contradicting earlier conclusions
- Increased latency on similar operations

**When triggers fire:**

1. Update WU YAML `notes` field with progress, decisions, and next steps
2. Run `pnpm mem:checkpoint --wu WU-XXX`
3. Commit work to the lane branch (in the worktree)
4. Push the lane branch to origin
5. Generate a fresh handoff with `pnpm wu:brief --id WU-XXX --client <client>`
6. Resume fresh from the documented checkpoint

**Deviation protocol:** If a trigger fires but you believe an exception applies, check section 1.1 (Documentation-Only Exception) or section 1.2 (Shallow Multi-File Exception). If your WU qualifies:

1. Document the justification in WU notes (required)
2. Specify which exception applies and why
3. Monitor for performance degradation symptoms listed above
4. If symptoms appear, checkpoint and spawn fresh regardless of file count

---

## 5. Spawn Fresh, Don't Continue (Mandatory Policy)

**When approaching context limits, spawn a fresh agent instead of continuing after compaction.**

Context compaction (summarization) causes agents to lose critical rules. The recommended approach from [Anthropic's engineering guidance](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) is:

> "An initializer agent that sets up the environment, and a coding agent tasked with **making incremental progress in every session**, while leaving clear artifacts for the next session."

### When to Spawn Fresh

Spawn a fresh agent when ANY of these apply:

- Context usage exceeds 80%
- Tool calls exceed 50 in current session
- You notice performance degradation (redundant queries, forgotten context)
- You're about to run `/compact` or `/clear`

### Spawn Fresh Protocol

```bash
# 1. Checkpoint your progress
pnpm mem:checkpoint "Progress: completed X, next: Y" --wu WU-XXX

# 2. Commit and push work
git add -A && git commit -m "checkpoint: progress on X"
git push origin lane/<lane>/wu-xxx

# 3. Generate fresh agent prompt
pnpm wu:brief --id WU-XXX --client <client>

# 4. EXIT current session (do NOT continue after compaction)

# 5. Start fresh agent with the generated prompt
```

### Why Not Continue After Compaction?

- Compaction summarizes conversation → rules get lost in summary
- Agent forgets worktree discipline, WU context, constraints
- Recovery mechanisms are complex and vendor-specific
- Prevention (fresh agent) is simpler and more reliable than recovery

**This is not failure—it's disciplined execution.** Each agent session makes bounded progress and leaves clear artifacts for the next session.

---

## 6. Quick Reference

| Scenario                                         | Strategy            | Action                                                        |
| :----------------------------------------------- | :------------------ | :------------------------------------------------------------ |
| Bug fix, single file, <20 tool calls             | Simple              | Claim, fix, commit, `wu:done`                                 |
| Feature spanning 50-100 tool calls, clear phases | Checkpoint-Resume   | Phase 1 → checkpoint → Phase 2 → checkpoint → done            |
| Multi-domain feature, must land atomically       | Orchestrator-Worker | Main agent coordinates, spawns test-engineer, safety-reviewer |
| Large refactor 100+ tool calls                   | Feature Flag Split  | WU-A: New behind flag → WU-B: Remove flag + old code          |
| New integration, uncertain complexity            | Tracer Bullet       | WU-A: Prove skeleton works → WU-B: Real implementation        |
| Docs-only, 30 markdown files                     | Simple (exception)  | Single session, document in notes, monitor for degradation    |
| Rename import across 45 files (uniform)          | Simple (override)   | Document justification, proceed if all 4 criteria met         |

---

## 7. Case Study: WU-1215 (Learning from Failure)

**WU:** Refactor wu-done.mjs 768-line `main()` function

**What went wrong:**

1. **Token exhaustion:** 80k/200k tokens (40%) consumed on analysis alone, zero implementation
2. **Worktree discipline violation:** Absolute paths (`/home/...`) in tool calls bypassed isolation, edits landed in main checkout
3. **Scope underestimation:** Spec said 708 LOC, actual was 768 LOC + 100 control flow statements (8% larger, significantly more complex)
4. **Single-session attempt for multi-phase work:** Extract → test → integrate phases require separate sessions

**What the agent did right (healthy recovery):**

- Self-detected violation via `git status` in main
- Immediately blocked WU with clear reason
- Documented root cause and next steps for handover
- Did not attempt to "power through" context exhaustion

**Lesson:** When scope exceeds session capacity, STOP and checkpoint. Document progress, commit, `/clear`, resume fresh. This is not failure—it's disciplined execution.

**Recommended strategy for WU-1215:** Feature Flag Split (Pattern D) with 3 WUs:

- WU-1: Extract validation modules + tests (~40 tool calls)
- WU-2: Extract orchestration logic + tests (~40 tool calls)
- WU-3: Final integration + cleanup (~30 tool calls)

This is a case study in genuinely non-atomic work. Do not generalize it into "multi-step work should be split." Most endpoint + tests + docs changes remain one WU.

---

## 8. Related Documentation

- [session-handoff.md](./agent/onboarding/session-handoff.md) — Mid-WU checkpoint protocol
- [agent-safety-card.md](./agent/onboarding/agent-safety-card.md) — Quick reference safety thresholds
- [parallel-session-optimization.md](./agent/onboarding/parallel-session-optimization.md) — Running 4-6 WUs concurrently
- [agent-invocation-guide.md](./agent/onboarding/agent-invocation-guide.md) — Orchestrator-worker patterns
- [LumenFlow Agent Capsule](./lumenflow-agent-capsule.md) — Full LumenFlow framework
- [Canonical Lifecycle Map](./lumenflow-agent-capsule.md) — Command-mode matrix and handoff points
- [Failure-Mode Runbook](./lumenflow-agent-capsule.md) — Remediation for common operational failures

---

**Version:** 1.5 (2026-03-12)
**Last Updated:** 2026-03-12
**Contributors:** Claude (research), Codex (pragmatic framing), Gemini (trigger enforcement)

**Changelog:**

- v1.5 (2026-03-12): Consolidated from two files into single canonical doc. Added consolidation checklist (1.0.1) to counter systematic agent over-splitting. Strengthened anti-patterns with additional examples.
- v1.3 (2026-02-25): Added sizing contract section (1.4) documenting tooling-backed enforcement via `sizing_estimate` metadata, advisory warnings in `wu:create`, and `--strict-sizing` mode in `wu:brief` (WU-2141, WU-2143).
- v1.4 (2026-03-10): Tightened anti-fragmentation guidance. Complex and oversized heuristics now force a cohesion re-check before decomposition, added explicit anti-patterns for backend/tests/docs micro-splitting, and replaced `/clear`-centric recovery advice with checkpoint + `wu:brief` handoff guidance.
- v1.2 (2026-02-01): Added documentation-only exception (section 1.1), shallow multi-file exception with single-session override criteria (section 1.2), and examples summary table (section 1.3). Updated deviation protocol to reference exceptions.
- v1.1 (2026-01-17): Removed time-based estimates (hours); replaced with tool-call and context-budget heuristics. Agents operate in context windows, not clock time.
- v1.0 (2025-11-24): Initial version based on WU-1215 post-mortem.
