# Quality Goals

**Last updated:** 2026-03-12

The top quality goals for LumenFlow, ordered by priority. These drive architectural decisions across the kernel and pack system.

---

| Priority | Quality Goal | Description |
|----------|-------------|-------------|
| 1 | **Security and Isolation** | Agents execute in OS-enforced sandboxes (Linux bwrap) with write confinement and secret overlays. A single deny from any authorization layer makes the decision final. Credentials flow through explicit env allowlisting, never ambient inheritance. |
| 2 | **Auditability** | Every tool call produces an immutable, content-addressed evidence record — regardless of outcome. Denials, crashes, and successes all become verifiable audit entries. Evidence recording persists before execution begins. |
| 3 | **Extensibility** | Domain-specific behavior lives in packs, not the kernel. Packs layer concepts (work units, initiatives, custom skills) atop kernel primitives without modifying kernel internals. New governance domains ship as pack additions, not kernel changes. |
| 4 | **Vendor Neutrality** | Works with any AI system capable of reading files and executing commands — Claude Code, Cursor, Windsurf, GitHub Copilot — without vendor lock-in. The kernel has no dependency on any AI SDK. |
| 5 | **Resilience** | Event-sourced state machines and file-based mutexes enable crash recovery without mutable state corruption. Workspace spec hashing detects configuration tampering mid-runtime. Agents that fail leave clear artifacts for the next session. |

---

## How These Goals Shape Decisions

- **Security over convenience**: sandbox execution adds latency but prevents ambient env leakage (see ADR-001, kernel tool execution)
- **Auditability over performance**: evidence is recorded before execution, not after — even if the tool call itself is fast
- **Extensibility over integration depth**: packs cannot import arbitrary npm packages; this limits convenience but preserves the security boundary
- **Vendor neutrality over optimization**: the kernel uses generic interfaces rather than provider-specific SDKs, accepting reduced feature depth for universality
