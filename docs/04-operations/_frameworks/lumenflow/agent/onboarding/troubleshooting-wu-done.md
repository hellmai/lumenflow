# Troubleshooting: wu:prep and wu:done Workflow

**Last updated:** 2026-03-11

This is the most common mistake agents make. This document explains the two-step completion workflow introduced in WU-1223.

---

## The New Workflow (WU-1223)

As of WU-1223, completion is a **two-step process**:

1. **From worktree**: Run `pnpm wu:prep --id WU-XXX` (runs gates, prints copy-paste instruction)
2. **From main**: Run `pnpm wu:done --id WU-XXX` (merge + cleanup only)

---

## The Problem

Agents complete their work, write "To Complete: pnpm wu:done --id WU-XXX" in their response, and then **stop without actually running the command**.

### Why This Happens

1. **Confusion about scope**: Agent thinks completion is a "next step" for the human
2. **Fear of overstepping**: Agent hesitates to take "final" actions
3. **Missing context**: Agent doesn't realize wu:done is expected to be run immediately
4. **Token limits**: Agent runs out of context and summarizes remaining steps

---

## The Fix

### Rule: Use wu:prep Then wu:done

After implementation is complete:

```bash
# Step 1: From worktree, run wu:prep
pnpm wu:prep --id WU-XXX
# This runs gates and prints a copy-paste instruction

# Step 2: Copy-paste the instruction from wu:prep output
cd /path/to/main && pnpm wu:done --id WU-XXX
```

Do NOT:

- Ask "Should I run wu:done?"
- Write "To Complete: pnpm wu:done"
- Run wu:done directly from a worktree (it will error)
- Skip wu:prep and go directly to wu:done from main (gates won't run in worktree)

---

## Correct Completion Flow

```bash
# 1. In worktree, run wu:prep
pnpm wu:prep --id WU-XXX
# Output includes: cd /path/to/main && pnpm wu:done --id WU-XXX

# 2. Copy-paste the wu:done command from the output
cd /path/to/main && pnpm wu:done --id WU-XXX

# 3. Report success with the wu:done output
```

---

## What wu:prep Does (WU-1223)

When you run `pnpm wu:prep --id WU-XXX` from a worktree:

1. Validates you're in a worktree (errors if in main)
2. Runs gates in the worktree
3. Prints copy-paste instruction for wu:done

## What wu:done Does (WU-1223)

When you run `pnpm wu:done --id WU-XXX` from main:

1. Validates you're in main checkout (errors if in worktree)
2. Fast-forward merges the lane branch to main
3. Creates the done stamp
4. Updates status and backlog docs
5. Removes the worktree
6. Pushes to origin

**This two-step process is the ONLY way to complete a WU.** Manual steps will leave things in an inconsistent state.

---

## Error Messages

### "wu:done must be run from main checkout"

If you see this error, you ran wu:done from a worktree. Use wu:prep instead:

```bash
# You're in the worktree - use wu:prep
pnpm wu:prep --id WU-XXX
# Then follow the copy-paste instruction it prints
```

### "wu:prep must be run from a worktree"

If you see this error, you ran wu:prep from main. Navigate to the worktree:

```bash
# Navigate to worktree first
cd worktrees/<lane>-wu-xxx
pnpm wu:prep --id WU-XXX
```

### "spec:linter failed"

`spec:linter` runs **scoped validation first** (current WU only), then **global validation**.

- If scoped validation fails, fix your WU spec.
- If global validation fails and the failures are **pre-existing on main**, `wu:prep` prints a
  ready-to-copy `wu:done --skip-gates --fix-wu WU-XXXX` command.
- If global validation introduces **new failures**, you must fix them before proceeding.

Feature WUs **must** include `spec_refs` (use `pnpm wu:create --plan` if the plan exists only in conversation).

---

---

## Cloud / Branch-PR Mode

Cloud agents (Codex, Claude web, CI runners) run on an active branch without a local worktree.
The completion flow is different: **there is no worktree and no merge to main**. Instead `wu:done` opens a PR.

### Cloud Completion Flow

```bash
# 1. From the active branch (cloud sandbox) — run wu:prep
pnpm wu:prep --id WU-XXX
# Output includes: pnpm wu:done --id WU-XXX
# (no "cd to main" — you stay on your branch)

# 2. Run wu:done from the same branch
pnpm wu:done --id WU-XXX
# wu:done detects branch-pr mode, calls gh pr create, stamps the WU
```

`wu:done` **must** successfully create a PR and return a URL. If it cannot (no `gh`, missing
permissions, or network error) the command exits with an error and the WU is **not** marked done.

### Cloud Error Messages

#### "PR creation failed: gh is not available"

`gh` CLI is not installed or not in `PATH`. Install it and authenticate before running `wu:done`:

```bash
# Verify gh is available
gh --version
gh auth status
```

#### "PR creation failed: no PR URL returned"

`gh pr create` ran but did not return a URL (may indicate an existing open PR or a
non-zero exit from `gh`). Check:

```bash
# See if a PR already exists for this branch
gh pr list --head $(git branch --show-current)
```

If a PR already exists, pass `--existing-pr <url>` to `wu:done` (if supported) or mark the WU
done manually via `pnpm wu:done --already-merged` once the PR is merged.

#### "wu:done must be run from main checkout" (cloud agent)

Cloud agents should **not** see this error — it means the WU was not claimed with `--cloud`.
Re-claim with the correct flag:

```bash
pnpm wu:claim --id WU-XXX --cloud
```

### Cloud Checklist

- [ ] WU was claimed with `--cloud` (sets branch-pr completion mode)
- [ ] `gh` CLI is installed and authenticated (`gh auth status`)
- [ ] `pnpm wu:prep --id WU-XXX` ran without errors
- [ ] `pnpm wu:done --id WU-XXX` completed and printed a PR URL
- [ ] WU stamp exists: `.lumenflow/stamps/WU-XXX.done`

---

## Exposure Auto-Fill (WU-1041)

If a WU is missing `exposure`, `wu:done` auto-sets a safe default:

- **Content lanes** -> `documentation`
- **Framework/Operations lanes** -> `backend-only`

Existing exposure values are preserved.

---

## Symptoms of Incomplete WU

If wu:done wasn't run, you'll see:

- Worktree still exists: `ls worktrees/`
- No stamp: `ls .lumenflow/stamps/WU-XXX.done` returns nothing
- Status unchanged: WU still shows as `in_progress`
- Branch not merged: Changes only on lane branch

---

## Recovery

If a previous agent forgot to run wu:done:

```bash
# 1. Check worktree exists
ls worktrees/

# 2. If it does, navigate there and run wu:prep
cd worktrees/<lane>-wu-xxx
pnpm wu:prep --id WU-XXX

# 3. Follow the copy-paste instruction
cd /path/to/main && pnpm wu:done --id WU-XXX
```

---

## Why This Matters

An incomplete WU causes problems:

1. **Lane blocked**: WIP=1 means no other work can start
2. **Work lost**: Changes might not reach main
3. **Context lost**: Next agent doesn't know work is done
4. **Process broken**: The whole workflow depends on wu:done

---

## Checklist Before Ending Session

- [ ] Did I run `pnpm wu:prep --id WU-XXX` in the worktree?
- [ ] Did wu:prep (gates) pass?
- [ ] Did I `cd` back to main using the copy-paste instruction?
- [ ] Did I run `pnpm wu:done --id WU-XXX`?
- [ ] Did wu:done complete successfully?

If any answer is "no", you're not done yet.

---

## Anti-Patterns

### WRONG:

```
I've completed all the work. To finish:
1. Run `pnpm wu:done --id WU-123`
```

### ALSO WRONG:

```bash
# Running wu:done from worktree (will error)
pnpm wu:done --id WU-123
```

### RIGHT:

```bash
# Step 1: From worktree, run wu:prep
pnpm wu:prep --id WU-123
# Output: cd /path/to/main && pnpm wu:done --id WU-123

# Step 2: Copy-paste the instruction
cd /path/to/main && pnpm wu:done --id WU-123
# Output: WU-123 completed successfully
```

Then report:

```
WU-123 completed successfully. Changes merged to main, stamp created.
```
