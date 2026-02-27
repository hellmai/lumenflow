# Sidekick Pack

Personal productivity pack for the LumenFlow kernel. Provides task management,
workspace memory, communication channels, routines, and system administration
tools -- all scoped to a local `.sidekick/` directory.

## Status

**Version**: 0.1.0 (pre-release)
**License**: AGPL-3.0-only

## Tool Groups

| Group     | Tools                                         | Description                       |
| --------- | --------------------------------------------- | --------------------------------- |
| Task      | `task:create`, `task:list`, `task:complete`, `task:schedule` | Create, query, complete, and schedule tasks |
| Memory    | `memory:store`, `memory:recall`, `memory:forget`             | Persist and retrieve workspace knowledge    |
| Channel   | `channel:configure`, `channel:send`, `channel:receive`       | Named message channels                      |
| Routine   | `routine:create`, `routine:list`, `routine:run`              | Multi-step tool sequences (plan-only)       |
| System    | `sidekick:init`, `sidekick:status`, `sidekick:export`        | Bootstrap, health check, data export        |

**Total**: 16 tools

## Key Design Decisions

- **`.sidekick/` is workspace-local storage.** All data lives under the project
  root in a `.sidekick/` directory managed by the `StoragePort` abstraction.
- **`routine:run` returns a plan only.** It resolves the routine definition and
  returns the ordered list of steps with their inputs. It does not execute them.
- **`sidekick:export` is read-only.** It returns all stored data as a JSON
  structure. It does not write files to disk.
- **Every write tool supports `dry_run`.** When `dry_run: true`, the tool
  validates input and returns what it would do, without persisting changes.
- **Pack manifest is the contract.** There is no separate contract package. The
  `manifest.yaml` file defines tool names, schemas, scopes, and policies.

## Manual Smoke Flow

Use this sequence to verify the pack end-to-end after installation or upgrade.

### Prerequisites

- LumenFlow kernel runtime with the sidekick pack registered
- HTTP surface running (for HTTP dispatch tests)

### Step 1: Initialize

```bash
# Via kernel tool dispatch (or HTTP POST /tools/sidekick:init)
tool: sidekick:init
input: {}
```

Expected: `{ "success": true, "data": { "initialized": true, "root_dir": ".sidekick" } }`

### Step 2: Create a Task

```bash
tool: task:create
input: { "title": "Review docs", "priority": "P1", "tags": ["docs"] }
```

Expected: `{ "success": true, "data": { "id": "<uuid>", "title": "Review docs", ... } }`

### Step 3: List Tasks

```bash
tool: task:list
input: { "status": "pending" }
```

Expected: Array containing the task from Step 2.

### Step 4: Store a Memory

```bash
tool: memory:store
input: { "type": "note", "content": "Sidekick pack validated", "tags": ["smoke-test"] }
```

Expected: `{ "success": true, "data": { "id": "<uuid>", ... } }`

### Step 5: Recall Memory

```bash
tool: memory:recall
input: { "query": "validated", "type": "note" }
```

Expected: Array containing the memory from Step 4.

### Step 6: Create a Routine

```bash
tool: routine:create
input: {
  "name": "daily-review",
  "steps": [
    { "tool": "task:list", "input": { "status": "pending" } },
    { "tool": "sidekick:status", "input": {} }
  ]
}
```

Expected: `{ "success": true, "data": { "id": "<uuid>", "name": "daily-review", ... } }`

### Step 7: Run Routine (plan-only)

```bash
tool: routine:run
input: { "id": "<routine-id-from-step-6>" }
```

Expected: A plan object listing the two steps with their resolved inputs. No
side-effects -- the steps are NOT executed.

### Step 8: Check Status

```bash
tool: sidekick:status
input: {}
```

Expected: Summary showing `task_count >= 1`, `memory_entries >= 1`,
`routines >= 1`.

### Step 9: Export

```bash
tool: sidekick:export
input: { "include_audit": true }
```

Expected: Full JSON dump of all stores including audit trail from prior steps.

### Step 10: Complete the Task

```bash
tool: task:complete
input: { "id": "<task-id-from-step-2>", "note": "Smoke test passed" }
```

Expected: `{ "success": true, "data": { "status": "done", ... } }`

### Step 11: Verify via HTTP Surface

```bash
curl -X POST http://localhost:<port>/tools/sidekick:status \
  -H "Content-Type: application/json" \
  -d '{ "context": { "task_id": "smoke-test", "workspace_id": "test" } }'
```

Expected: HTTP 200 with the same status payload as Step 8.

### Dry Run Verification

Repeat Step 2 with `"dry_run": true` added to the input. Verify that the
response includes `"dry_run": true` and that `task:list` does not return the
dry-run task.

## Validation

```bash
# Schema and integrity validation
pnpm pack:validate --id sidekick

# Unit tests (119 tests across 3 suites)
npx vitest run packages/@lumenflow/packs/sidekick/__tests__/

# HTTP surface tests (13 tests)
npx vitest run packages/@lumenflow/surfaces/http/__tests__/tool-api.test.ts
```

## Storage Architecture

The pack uses a `StoragePort` abstraction with a filesystem adapter
(`FsStoragePort`). Each store (tasks, memories, channels, messages, routines)
is a JSON array file under `.sidekick/`. An append-only `audit.jsonl` file
records every tool invocation.

```
.sidekick/
  tasks.json
  memories.json
  channels.json
  messages.json
  routines.json
  audit.jsonl
```

## Contributing

This pack follows the LumenFlow development workflow. See the root `CLAUDE.md`
and `LUMENFLOW.md` for contribution guidelines.
