---
id: quick-fix-commands
name: Quick Fix Commands
required: true
order: 210
tokens: []
---

## Quick Fix Commands

If gates fail, start with the exact files or commands named by the gate output:

```bash
pnpm prettier --write path/to/file.ts  # Format only the files named by gates
pnpm lint                              # Re-check linting after edits
pnpm typecheck                         # Re-check TypeScript types
```

**Prefer targeted formatter commands from gate output over repo-wide `pnpm format`.** These are faster than full `pnpm gates`.
