# @lumenflow/mcp Server

**Purpose:** Document the architecture and usage of the LumenFlow MCP server, which exposes LumenFlow workflow operations as native tools/resources for AI coding assistants.

## Overview

The `@lumenflow/mcp` package exposes LumenFlow as an MCP (Model Context Protocol) server. This allows AI agents to manage Work Units natively, with typed parameters and structured responses, instead of learning CLI command syntax.

```
┌─────────────────┐     stdio          ┌─────────────────┐
│   AI Client     │ ←────────────────→ │   MCP Server    │
│  (Claude Code)  │   JSON-RPC 2.0     │  (@lumenflow/   │
│                 │                     │      mcp)       │
└─────────────────┘                     └─────────────────┘
        │                                       │
        │ "Call lumenflow_wu_list"              │
        │ ─────────────────────────────────→    │
        │                                       │ reads from
        │ { wus: [...] }                        │ LumenFlow runtime modules
        │ ←─────────────────────────────────    │
```

## Quick Start

### Installation

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "lumenflow": {
      "command": "npx",
      "args": ["-y", "@lumenflow/mcp"]
    }
  }
}
```

Or use `lumenflow` which scaffolds this automatically:

```bash
pnpm lumenflow --client claude
```

### Verification

```bash
# List connected MCP servers in Claude Code
claude mcp list

# Should show:
# - lumenflow (connected)
```

## Tools Model

The MCP server currently exposes 114 tools organized into 13 categories.
The source of truth is `packages/@lumenflow/mcp/src/tools.ts` (`allTools`, `runtimeTaskTools`, and `registeredTools` exports).

| Category                      | Count | Purpose                                          |
| ----------------------------- | ----- | ------------------------------------------------ |
| Core WU Operations            | 8     | Context + primary WU lifecycle commands          |
| Public Parity Operations (W1) | 15    | Ops/setup parity commands from public CLI        |
| Public Parity Operations (W2) | 17    | File/git/plan/signal/config parity commands      |
| Additional WU Operations      | 17    | Extended WU management and recovery operations   |
| Initiative Operations         | 8     | Initiative creation/planning/assignment commands |
| Memory Operations             | 14    | Session memory, checkpoints, inbox/signals       |
| Agent Operations              | 4     | Agent session + issue logging                    |
| Orchestration Operations      | 3     | Initiative orchestration/monitoring              |
| Delegation Operations         | 1     | Delegation tree management                       |
| Flow/Metrics Operations       | 3     | Bottlenecks, reports, metrics snapshot           |
| Validation Operations         | 5     | Skills/backlog/agent validation commands         |
| Setup Operations              | 8     | Init/doctor/integrate/release/template sync      |
| Runtime Task Tools            | 7     | Kernel runtime task lifecycle tools              |

Public CLI parity uses normalized command names (`:`/`-` -> `_`) and targets the current public command manifest where that surface maps cleanly into MCP. The registry also includes MCP-only convenience tools and 7 runtime task tools. Current inventory totals:

- `allTools`: 107
- `runtimeTaskTools`: 7
- `registeredTools`: 114

Wave-2 parity families now available in MCP include:
`file_read`, `file_write`, `file_edit`, `file_delete`, `git_status`, `git_diff`,
`git_log`, `git_branch`, `init_plan`, `plan_create`, `plan_edit`, `plan_link`,
`plan_promote`, `signal_cleanup`, and `wu_proto`.

For full per-tool parameter and response reference, see:
`apps/docs/src/content/docs/reference/mcp.mdx`.

## Example Payload Validation

Strict MCP payload examples are validated against the live tool registry and each tool's input
schema. Use explicit example tags so docs parity can distinguish copy-paste-safe examples from
illustrative snippets.

<!-- lumenflow-example: strict -->

```json
{
  "name": "wu_status",
  "arguments": {
    "id": "WU-1234",
    "json": true
  }
}
```

The strict example above must continue to parse against the live `wu_status` input schema. For
partial or schematic examples, use `illustrative`, `historical`, `legacy`, or `placeholder` tags
instead so readers and tests both know they are not copy-paste-safe.

## Resources Reference

| URI                   | Description                                               |
| --------------------- | --------------------------------------------------------- |
| `lumenflow://context` | Current execution context (same as lumenflow_context_get) |
| `lumenflow://wu/{id}` | Raw WU YAML content for specific WU                       |
| `lumenflow://backlog` | Raw backlog.md content                                    |

## Architecture

### Execution Model

```
┌────────────────────────────────────────────────────────────┐
│                    @lumenflow/mcp                          │
├────────────────────────────────────────────────────────────┤
│  Native MCP Tools         │  Compatibility Adapters        │
│  ─────────────────────    │  ────────────────────────      │
│  Runtime-first handlers   │  Canonical command wrappers    │
│  - Typed responses        │  - Preserve existing behavior  │
│  - Direct module access   │  - Keep public command parity  │
│  - Structured errors      │  - Reuse command validation    │
└────────────────────────────────────────────────────────────┘
```

The current MCP server is runtime-first. It uses native handlers where the runtime already has a strong typed surface, and uses compatibility wrappers where parity with public commands is still the right path.

### Core APIs Used

The MCP server uses shared runtime modules and public command definitions:

| API / Module      | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `PUBLIC_MANIFEST` | Public command metadata and parity mapping                   |
| Runtime handlers  | Native MCP execution for context, tasks, and lifecycle flows |
| Zod schemas       | Tool input validation and JSON Schema generation             |

### Transport

**Default:** stdio (local process communication)

The AI client spawns the MCP server as a subprocess and communicates via stdin/stdout using JSON-RPC 2.0.

**Future:** Streamable HTTP for remote/cloud scenarios (not in MVP).

## Security Model

### Local Trust

The MCP server runs locally with same permissions as the user. No additional authentication required.

### Enforcement Preserved

- Tool execution still routes through the normal runtime enforcement layers
- `skip_gates` remains a controlled escape hatch rather than a default MCP path
- Lane locks, state validation, and command policy still apply through the underlying runtime and command modules

### Publish Authentication (`lumenflow_release`)

The MCP `lumenflow_release` tool delegates to CLI `release`, which uses this auth model:

1. Preferred for CI/automation: `NPM_TOKEN`
2. Also supported: `NODE_AUTH_TOKEN`
3. Local fallback: `_authToken=` entry in `~/.npmrc`

This keeps MCP release behavior aligned with direct CLI release behavior.

### MCP Protocol Security

Per MCP specification, hosts must obtain user consent before tool invocation. Claude Code and other MCP clients handle this at the protocol level.

## Configuration

### Environment Variables

| Variable                  | Description                                 | Default     |
| ------------------------- | ------------------------------------------- | ----------- |
| `LUMENFLOW_PROJECT_ROOT`  | Override project root detection             | Auto-detect |
| `LUMENFLOW_MCP_LOG_LEVEL` | Logging verbosity: debug, info, warn, error | info        |

### Version Pinning

```json
{
  "mcpServers": {
    "lumenflow": {
      "command": "npx",
      "args": ["-y", "@lumenflow/mcp@2.11.0"]
    }
  }
}
```

## Comparison: CLI vs MCP

| Aspect              | CLI Only           | CLI + MCP           |
| ------------------- | ------------------ | ------------------- |
| Parameter discovery | AI guesses flags   | AI sees JSON Schema |
| Output parsing      | AI parses stdout   | AI gets typed JSON  |
| Error handling      | Text parsing       | Structured errors   |
| Discoverability     | Must know commands | Tools auto-listed   |
| Integration         | Manual bash calls  | Native tool calling |

## Package Structure

```
packages/@lumenflow/mcp/
├── src/
│   ├── bin.ts                # stdio entrypoint
│   ├── index.ts              # package exports
│   ├── server.ts             # MCP server factory/handlers
│   ├── tools.ts              # tool definitions + allTools/runtimeTaskTools registries
│   ├── resources.ts          # 3 MCP resources + templates
│   ├── cli-runner.ts         # CLI shell-out adapter for write operations
│   └── __tests__/            # tool/resource/server integration tests
└── package.json
```

---

## Version History

### v3.18 (March 2026) - Public Parity And Runtime Expansion

Updated documentation for the current 114-tool / 13-category model, including
107 core tools, 7 runtime task tools, and the current public parity accounting.

### v1.0 (February 2026) - Initial Architecture

Initial MCP rollout with the first tool/resource set, hybrid execution model (core reads, CLI writes), and stdio transport.
