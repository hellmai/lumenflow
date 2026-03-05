# First 15 Minutes with LumenFlow

**Last updated:** 2026-03-06

A fast start for agents entering an existing LumenFlow project.

---

## Minute 0-2: Verify the Workspace

```bash
ls LUMENFLOW.md AGENTS.md workspace.yaml
pnpm exec lumenflow doctor
```

If the doctor reports a repo-level problem, stop there and fix it before claiming work.

---

## Minute 2-5: Read the Required Docs

1. Open `LUMENFLOW.md` for the lifecycle overview.
2. Scan `AGENTS.md` for repo-specific workflow rules.
3. Review `.lumenflow/constraints.md` for the non-negotiables.
4. Open `starting-prompt.md` if you need the full onboarding flow.

---

## Minute 5-8: Find the Work

```bash
cat docs/04-operations/tasks/status.md
ls docs/04-operations/tasks/wu/*.yaml | head -5
```

Read the assigned WU spec before touching files.

---

## Minute 8-12: Claim and Move

```bash
pnpm wu:claim --id WU-XXX --lane "Framework: CLI"
cd worktrees/framework-cli-wu-xxx
pnpm bootstrap
```

After `wu:claim`, all implementation work happens in the worktree, not in the main checkout.

---

## Minute 12-15: Start the Right Cycle

For code WUs:

```bash
pnpm test -- --run
```

For docs-heavy WUs:

```bash
pnpm format docs/04-operations/_frameworks/lumenflow/agent/onboarding/*.md
```

Before completion, always use the two-step flow:

```bash
pnpm wu:prep --id WU-XXX
cd <project-root> && pnpm wu:done --id WU-XXX
```

---

## Key Reminders

- Stay in the claimed worktree.
- Run `pnpm lumenflow:commands` for public CLI discovery, then `--help` before first use.
- Use `pnpm wu:prep` before `pnpm wu:done`; do not jump straight to `wu:done`.
- If context starts getting heavy, read `./wu-sizing-guide.md` before pushing further.
