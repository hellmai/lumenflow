# Local-Only Development

**Last updated:** 2026-03-12

Use this local-only mode when the repo has no `origin` remote yet or you are intentionally working offline.

---

## Raw YAML Configuration

Set the workspace config under `software_delivery.git`:

```yaml
software_delivery:
  git:
    requireRemote: false
```

---

## Safer CLI Alternative

Use the config command when possible instead of editing YAML directly:

```bash
pnpm config:set --key git.requireRemote --value false
```

The `git.requireRemote` dotpath is rooted under `software_delivery`.

---

## Behavior Changes

When `requireRemote: false`:

- `wu:create` skips remote fetch requirements.
- `wu:claim` can proceed without pushing a lane branch.
- Local evaluation and air-gapped testing remain unblocked.

When `requireRemote: true` (default):

- `wu:create` and `wu:claim` expect `origin/main`.
- Team-visible coordination happens through the remote.

---

## Transitioning Back to Remote Mode

```bash
pnpm config:set --key git.requireRemote --value true
git remote add origin <url>
git push -u origin main
```

If the repo already has the correct remote, you can simply remove the override and resume the standard workflow.
