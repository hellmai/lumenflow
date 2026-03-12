# Stakeholders

**Last updated:** 2026-03-12

Key stakeholder groups and their primary concerns with LumenFlow.

---

| Stakeholder | Role | Key Concerns |
|-------------|------|-------------|
| **Solo developers** | Use AI assistants (Claude Code, Cursor, etc.) for day-to-day coding | Agent doesn't break things; work is tracked and resumable; minimal ceremony |
| **Engineering teams** | Coordinate multiple agents and humans on shared codebases | Workflow governance; lane isolation; audit trail for compliance; consistent quality gates |
| **Team leads / managers** | Oversee agent-assisted delivery | Visibility into agent actions; initiative tracking; metrics and flow health |
| **Security / compliance** | Ensure agent behavior meets organizational policies | Enforceable scope boundaries; immutable evidence; sandbox isolation; credential management |
| **Pack authors** | Build domain-specific governance extensions | Clear kernel API surface; pack authoring docs; manifest and policy primitives |
| **AI agent clients** | Autonomous agents executing within LumenFlow governance | Discoverable tools; clear permission model; structured error feedback on policy denials |
| **Open-source contributors** | Extend LumenFlow, report issues, propose changes | Contribution guidelines; architectural documentation; clear module boundaries |

---

## Stakeholder Expectations by Quality Goal

| Quality Goal | Most Important To |
|-------------|-------------------|
| Security and Isolation | Security/compliance, engineering teams |
| Auditability | Security/compliance, team leads |
| Extensibility | Pack authors, open-source contributors |
| Vendor Neutrality | Solo developers, engineering teams |
| Resilience | Solo developers (crash recovery), engineering teams (parallel agents) |
