# HellmAI Company Constitution

**Version:** 1.0
**Effective Date:** 2025-10-23

---

## Purpose

This constitution defines the core principles that govern all HellmAI operations, products, and decisions. These principles form the foundation of our Company Operating System (COS) and are enforced through governance rules.

---

## The 10 Principles

### 1. Truth-First Communication

**Principle:** Honest, transparent communication beats optimistic spin.

**In Practice:**
- Public postmortems for all incidents
- Clear documentation of limitations and risks
- No hiding mistakes or bad news
- Evidence-based claims only

**COS Rule:** `TRUTH-01` (Postmortems required for all incidents)

---

### 2. User Pain Over Features

**Principle:** Solve real user problems, not theoretical ones.

**In Practice:**
- Every product feature requires documented user pain evidence
- Voice of customer (VoC) documentation required before build
- User research drives roadmap, not competitive feature lists
- Small experiments validate pain before big investments

**COS Rule:** `UPAIN-01` (Evidence of user pain required)

---

### 3. Privacy By Default

**Principle:** Protect user data as if it were our own.

**In Practice:**
- Privacy-preserving design from day one
- Minimal data collection and retention
- Clear consent mechanisms
- GDPR/UK law compliance baked in, not bolted on

**COS Rule:** (Future rule for privacy impact assessments)

---

### 4. No Dark Patterns

**Principle:** Never manipulate users for business gain.

**In Practice:**
- Transparent pricing (no hidden fees, clear cancellation)
- Easy account deletion and data export
- No deceptive UI patterns
- Screenshots of pricing/cancellation flows as evidence

**COS Rule:** `FAIR-01` (Transparent pricing and cancellation required)

---

### 5. Cash Discipline

**Principle:** Every pound spent must be justified and tracked.

**In Practice:**
- Spend reviews for commitments >£{SPEND_THRESHOLD}/month
- No "nice-to-haves" without ROI analysis
- Small experiments before big bets
- Track cohort retention and burn rate

**COS Rule:** `CASH-03` (Spend review process required)

---

### 6. Small Experiments Over Big Bets

**Principle:** Learn fast with small reversible decisions.

**In Practice:**
- Time-box research spikes (≤2 days)
- MVP first, polish later
- A/B test before scaling
- Kill projects quickly if not working

**COS Rule:** (Tracked via WU size limits in LumenFlow)

---

### 7. Public Postmortems

**Principle:** Share failures openly to build trust and improve.

**In Practice:**
- All incidents get public postmortems (within regulatory limits)
- Blameless culture - focus on systems, not people
- Document what went wrong, why, and how we'll prevent it
- Share learnings with the wider community

**COS Rule:** `TRUTH-01` (Postmortems required)

---

### 8. Architecture Integrity

**Principle:** Clean boundaries prevent chaos at scale.

**In Practice:**
- Hexagonal architecture (ports & adapters)
- No shortcuts that violate boundaries
- Infrastructure never leaks into business logic
- Automated boundary enforcement in CI

**COS Rule:** (Enforced via ESLint boundaries plugin)

---

### 9. Stewardship of Trust

**Principle:** We are stewards, not owners, of user trust.

**In Practice:**
- Safety-critical features require human review (STOP-AND-ASK)
- No shipping LLM features without golden dataset testing
- Crisis detection must have >98% recall
- Regulatory compliance is non-negotiable

**COS Rule:** (Multiple safety rules in LumenFlow DoD)

---

### 10. One Source of Truth

**Principle:** Single, authoritative source for all information.

**In Practice:**
- LumenFlow backlog is law (no shadow roadmaps)
- Documentation lives with code
- Metrics tracked in one dashboard
- No "my version vs your version" confusion

**COS Rule:** `GOV-WEEKLY` (Weekly operating review ritual)

---

## Enforcement

These principles are enforced through:
1. **COS Governance Rules** (`hellmai-core-rules.yaml`) - Automated gates in `wu:done`
2. **LumenFlow DoD** - Manual checks in work unit acceptance criteria
3. **Weekly Operating Review** - Team reviews adherence and scoreboard metrics
4. **Incident Response** - Constitution violations trigger mandatory postmortems

---

## Amendment Process

This constitution can only be amended through:
1. Proposal documented in WU (Discovery lane)
2. Team consensus (100% agreement required)
3. 2-week comment period
4. Formal vote
5. Update versioned and committed to hellmai/os

**Rationale:** Core principles should be stable. High amendment bar ensures we don't water down commitments under pressure.

---

## References

- **COS v1.3 System Prompt:** [system-prompt-v1.3.md](./system-prompt-v1.3.md)
- **Governance Rules:** [rules/hellmai-core-rules.yaml](./rules/hellmai-core-rules.yaml)
- **Evidence Format:** [evidence-format.md](./evidence-format.md)
- **Operating Scoreboard:** [operating-scoreboard-template.md](./operating-scoreboard-template.md)

---

**Inspired by:** *Business Adventures* by John Brooks - lessons on corporate integrity, transparency, and stewardship from 50+ years of business history.
