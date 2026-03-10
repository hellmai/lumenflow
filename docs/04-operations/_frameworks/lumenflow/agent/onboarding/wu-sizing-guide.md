# Work Unit Sizing Guide

**Last updated:** 2026-03-10

Use this summary to decide whether work should stay as one WU and what execution strategy it needs.

---

## Default Bias

Bias toward **one coherent outcome = one WU**.

Do not split a WU just because it has multiple implementation steps, tests, or docs, or because it may need another session. Split only when the work is no longer one coherent deliverable.

Before splitting, ask: **Can these parts ship, review, and roll back independently?** If no, keep one WU and choose a better execution strategy.

Keep one WU when:

- The acceptance criteria describe one user-visible or operator-visible outcome
- One agent can still complete it with `single-session`, `checkpoint-resume`, or `orchestrator-worker`
- The touched files support the same change, even if there are several of them
- Code, tests, and docs all support the same change

Split when:

- Parts can ship or be reviewed independently
- Different lanes or owners should deliver different parts
- Risk isolation matters, such as tracer-bullet, feature-flag, or adapter-first rollout
- The work keeps widening and no longer has a clean stopping point

Anti-patterns that should usually stay one WU:

- One API endpoint split into backend, tests, and docs WUs
- One shippable feature split into backend and frontend WUs even though neither stands alone
- One refactor split into "step 1", "step 2", and "cleanup" WUs with no independent ship point

---

## Baseline Heuristics

| Complexity | Files | Tool Calls | Suggested Strategy                                                                        |
| ---------- | ----- | ---------- | ----------------------------------------------------------------------------------------- |
| Simple     | <20   | <50        | Single session                                                                            |
| Medium     | 20-50 | 50-100     | Checkpoint and resume                                                                     |
| Complex    | 50+   | 100+       | Orchestrate or checkpoint first; split only if the WU is non-atomic                       |
| Oversized  | 100+  | 200+       | Re-check cohesion; split only if no exception applies and the work cannot land coherently |

These are guardrails for session strategy, not a license to multiply WUs that still belong together.

---

## Context Safety Triggers

Checkpoint and hand off when any of these happen:

- Context usage approaches 50% and is still climbing
- Tool calls exceed roughly 50 in one session
- File churn keeps widening without clear closure
- You have to repeatedly rediscover the same repo rules

If a trigger fires, first ask whether the WU is still atomic. If yes, checkpoint or hand off. If no, split it.

---

## Recovery Pattern

```bash
pnpm mem:checkpoint "state before handoff" --wu WU-XXX
pnpm wu:brief --id WU-XXX --client codex-cli
```

Use handoff when the WU is still coherent but the session is getting tired. Split only when the work itself is no longer coherent.

---

## Docs-Only Exception

Documentation WUs can tolerate broader file counts when the change pattern is shallow and mechanical, but they still need to stay understandable in one session.

If the docs work starts spilling into CLI, core, or packaging changes, treat it like a normal cross-code WU again.

## Shallow Multi-File Exception

Code WUs may also stay as one WU when the change is mechanical across many files, such as a rename or import rewrite, and each file change stays shallow and uniform.
