# Product Vision

**Last updated:** 2026-03-12

---

## What is LumenFlow?

LumenFlow is an open-source governance framework that creates accountability and control layers for AI agents. It sits between autonomous agents and the resources they interact with — filesystems, version control, APIs, cloud infrastructure — enforcing rules before actions happen, not after.

The framework operates like an operating system kernel: every agent action passes through permission verification, policy enforcement, and evidence recording before execution proceeds.

## The Problem

AI agents present a critical governance gap:

1. **No audit trail** — agents act without accountability mechanisms; when issues occur there is no way to investigate what happened
2. **No enforceable policy** — system prompts are suggestions, not boundaries; agents can accidentally wander past any scope constraint
3. **After-the-fact only** — CI pipelines and code review catch problems only after agents have already acted

Nobody is governing them. There is no audit trail, no enforceable policy, and no scope boundary that an agent cannot accidentally bypass.

## The Solution

LumenFlow resolves this by inserting a governance layer that constrains, monitors, and documents agent actions. Every agent action undergoes three sequential stages:

1. **Permission verification** — scope intersection checks whether the agent has authorization across workspace, lane, task, and tool levels; all must align
2. **Policy enforcement** — a deny-wins cascade ensures that restrictive policies cannot be overridden by lower-level permissions
3. **Execution and documentation** — tools run in sandboxed isolation while immutable audit records are generated

## Architecture

LumenFlow comprises two complementary components:

- **Kernel** — domain-agnostic infrastructure handling scope intersection, policy evaluation, evidence storage, and tool execution
- **Packs** — pluggable domain-specific extensions that teach the kernel industry-specific operations and constraints (e.g., the `software-delivery` pack provides work units, lanes, gates, and agent coordination)

## Who It's For

- **Developers** managing AI coding assistants in production environments who need structural guarantees around agent behavior
- **Engineering teams** requiring compliance documentation, workflow control, and auditable agent execution
- **Open-source contributors** building domain-specific governance extensions as packs

## Design Philosophy

1. **Policy as declarative code, not convention** — governance rules are enforced by the runtime, not by hoping agents follow instructions
2. **Evidence-based verification over status claims** — every action generates tamper-proof, content-addressed audit records
3. **Continuous real-time governance** — policy enforcement happens at execution time, not in post-hoc review
4. **Agents as accountable team members** — agents receive identical oversight and structural boundaries as human contributors

## Licensing

Dual-license model balancing transparency with commercial flexibility:

- **AGPL v3** for core components — enforces modification disclosure for network-deployed instances
- **Apache 2.0** for the Control Plane SDK — enables proprietary integrations without viral licensing concerns
