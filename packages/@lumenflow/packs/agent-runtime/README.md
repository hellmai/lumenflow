# Agent Runtime Pack

Scaffold for the governed `agent-runtime` pack.

Current scope:

- declares the pack manifest and configuration namespace
- reserves the `agent:execute-turn` tool surface
- pins static sandbox scopes for storage, network, and env passthrough
- provides stub provider capability and tool implementation modules for follow-on work

The scaffold intentionally does not implement provider-backed turn execution yet. That behavior lands in the next work unit.
