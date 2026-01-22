# Claude Code Entry Point

Read `LUMENFLOW.md` first and follow the workflow there.

Claude Code can spawn sub-agents. Use:

```bash
pnpm wu:spawn --id WU-XXX --client claude-code
```

Use `wu:spawn` when:

- You need parallel investigation or implementation on the same WU.
- You want a standardized, context-loaded prompt for another agent.

Quick reminders:

- Always claim WUs with `pnpm wu:claim` and work in the worktree.
- Run `pnpm gates` before `pnpm wu:done`.
- Complete work with `pnpm wu:done --id WU-XXX` from the main checkout.
