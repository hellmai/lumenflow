# Cursor LumenFlow Rules

**Read first:** [AGENTS.md](../../AGENTS.md) for universal startup rules, then [LUMENFLOW.md](../../LUMENFLOW.md) for the canonical workflow, commands, and safety rules.

This file contains Cursor-specific overrides only. Do not duplicate workflow rules from LUMENFLOW.md here.

---

## Cursor-Specific Notes

- Cursor does not have hook enforcement -- follow workflow rules voluntarily
- Use `pnpm lumenflow:commands` to discover all CLI commands
- Run `<command> --help` before first use of any command
- **Never truncate** CLI output (`| head`, `| tail`, `| head -n`) — read the full output
