# Operating Scoreboard

**Project:** {PROJECT_NAME}
**Week:** {YYYY-WW} ({START_DATE} to {END_DATE})
**Review Date:** {REVIEW_DATE}

---

## Flow Metrics (LumenFlow)

### Work Unit Throughput

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **WUs Completed** | {N} | {N} | {TARGET} | {🟢/🟡/🔴} |
| **WUs In Progress** | {N} | {N} | ≤5 (1 per lane) | {🟢/🟡/🔴} |
| **WUs Blocked** | {N} | {N} | ≤2 | {🟢/🟡/🔴} |
| **Avg Cycle Time** | {N} days | {N} days | ≤3 days | {🟢/🟡/🔴} |

**Notes:**
- {Commentary on throughput trends}
- {Blockers resolved this week}
- {Capacity changes}

### Lane Health

| Lane | WUs Done | Cycle Time | Blocked? | Notes |
|------|----------|------------|----------|-------|
| **Experience** | {N} | {N} days | {Yes/No} | {Notes} |
| **Core Systems** | {N} | {N} days | {Yes/No} | {Notes} |
| **Intelligence** | {N} | {N} days | {Yes/No} | {Notes} |
| **Operations** | {N} | {N} days | {Yes/No} | {Notes} |
| **Discovery** | {N} | {N} days | {Yes/No} | {Notes} |

---

## DORA Metrics

### Deployment Frequency

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Deploys to Production** | {N} | {N} | ≥5/week | {🟢/🟡/🔴} |
| **Deploys to Staging** | {N} | {N} | ≥10/week | {🟢/🟡/🔴} |

**Notes:**
- {Deployment cadence observations}
- {Deployment blockers}

### Lead Time for Changes

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Commit to Production** | {N} hours | {N} hours | <24h | {🟢/🟡/🔴} |
| **WU Start to Production** | {N} days | {N} days | <3 days | {🟢/🟡/🔴} |

**Notes:**
- {Lead time trends}
- {CI/CD bottlenecks}

### Change Failure Rate

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Failed Deploys** | {N} of {TOTAL} | {N} of {TOTAL} | <15% | {🟢/🟡/🔴} |
| **Rollbacks** | {N} | {N} | ≤1/week | {🟢/🟡/🔴} |

**Notes:**
- {Failure root causes}
- {Prevention measures}

### Mean Time to Recovery (MTTR)

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **MTTR (all incidents)** | {N} hours | {N} hours | <1h | {🟢/🟡/🔴} |
| **Incidents This Week** | {N} | {N} | ≤2/week | {🟢/🟡/🔴} |

**Links:**
- {link:postmortem/incident-1}
- {link:postmortem/incident-2}

---

## Quality Metrics

### Test Coverage

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Overall Coverage** | {N}% | {N}% | ≥90% | {🟢/🟡/🔴} |
| **Application Layer** | {N}% | {N}% | ≥95% | {🟢/🟡/🔴} |
| **Infrastructure Layer** | {N}% | {N}% | ≥80% | {🟢/🟡/🔴} |

### Gate Pass Rate

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Pre-commit Gates** | {N}% pass | {N}% pass | 100% | {🟢/🟡/🔴} |
| **CI Pipeline** | {N}% pass | {N}% pass | ≥95% | {🟢/🟡/🔴} |
| **Skip-Gates Usage** | {N} times | {N} times | ≤2/week | {🟢/🟡/🔴} |

**Notes:**
- {Gate failure patterns}
- {Skip-gates justifications}

---

## Outcome Metrics

### User Impact

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Active Users** | {N} | {N} | {TARGET} | {🟢/🟡/🔴} |
| **User-Reported Issues** | {N} | {N} | ≤5/week | {🟢/🟡/🔴} |
| **NPS Score** | {N} | {N} | ≥50 | {🟢/🟡/🔴} |

**Evidence:**
- {link:voc_doc/user-feedback-summary}
- {link:analytics/weekly-dashboard}

### Business Metrics

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| **Revenue** | £{N} | £{N} | £{TARGET} | {🟢/🟡/🔴} |
| **Monthly Burn Rate** | £{N} | £{N} | ≤£{LIMIT} | {🟢/🟡/🔴} |
| **Runway** | {N} months | {N} months | ≥12 months | {🟢/🟡/🔴} |

**Evidence:**
- {link:finance/monthly-report}
- {approval:tom@hellm.ai} (for spend >£{SPEND_THRESHOLD}/month)

---

## COS Governance Compliance

### Rule Adherence

| Rule ID | Statement | Evidence | Status |
|---------|-----------|----------|--------|
| **TRUTH-01** | Postmortems for incidents | {link:postmortem/...} | {✅/⚠️/❌} |
| **UPAIN-01** | User pain evidence | {link:voc_doc/...} | {✅/⚠️/❌} |
| **FAIR-01** | No dark patterns | {screenshot:pricing}, {screenshot:cancellation} | {✅/⚠️/❌} |
| **CASH-03** | Spend review | {approval:tom@hellm.ai} | {✅/⚠️/❌} |
| **GOV-WEEKLY** | Operating review | This document | {✅/⚠️/❌} |

**Notes:**
- {Governance violations this week}
- {Corrective actions taken}

---

## Risks & Actions

### Top 3 Risks

1. **{Risk Title}**
   - **Impact:** {High/Medium/Low}
   - **Likelihood:** {High/Medium/Low}
   - **Mitigation:** {Action plan}
   - **Owner:** {Name}
   - **Due:** {Date}

2. **{Risk Title}**
   - **Impact:** {High/Medium/Low}
   - **Likelihood:** {High/Medium/Low}
   - **Mitigation:** {Action plan}
   - **Owner:** {Name}
   - **Due:** {Date}

3. **{Risk Title}**
   - **Impact:** {High/Medium/Low}
   - **Likelihood:** {High/Medium/Low}
   - **Mitigation:** {Action plan}
   - **Owner:** {Name}
   - **Due:** {Date}

### Action Items from Last Week

| Action | Owner | Due | Status |
|--------|-------|-----|--------|
| {Action description} | {Name} | {Date} | {✅/🔄/❌} |
| {Action description} | {Name} | {Date} | {✅/🔄/❌} |

### New Action Items This Week

| Action | Owner | Due | Priority |
|--------|-------|-----|----------|
| {Action description} | {Name} | {Date} | {P0/P1/P2} |
| {Action description} | {Name} | {Date} | {P0/P1/P2} |

---

## Weekly Highlights

### 🎉 Wins

- {Major accomplishment 1}
- {Major accomplishment 2}
- {Major accomplishment 3}

### 📚 Learnings

- {Key learning 1}
- {Key learning 2}
- {Key learning 3}

### 🔄 Process Improvements

- {Process change 1}
- {Process change 2}
- {Process change 3}

---

## Next Week Priorities

### Top 3 Focus Areas

1. **{Focus Area 1}**
   - **Why:** {Rationale}
   - **Success Criteria:** {Measurable outcome}
   - **Owner:** {Name/Lane}

2. **{Focus Area 2}**
   - **Why:** {Rationale}
   - **Success Criteria:** {Measurable outcome}
   - **Owner:** {Name/Lane}

3. **{Focus Area 3}**
   - **Why:** {Rationale}
   - **Success Criteria:** {Measurable outcome}
   - **Owner:** {Name/Lane}

---

## Appendix: Legend

### Status Indicators

- 🟢 **Green:** On track, meeting targets
- 🟡 **Yellow:** At risk, needs attention
- 🔴 **Red:** Off track, immediate action required

### Metric Targets

Targets are defined in:
- **LumenFlow Metrics:** [lumenflow-complete.md](../lumenflow/lumenflow-complete.md)
- **DORA Benchmarks:** Based on "Accelerate" research (Elite: <1h MTTR, <15% CFR, >5 deploys/week, <24h lead time)
- **COS Rules:** [rules/hellmai-core-rules.yaml](./rules/hellmai-core-rules.yaml)

---

## References

- **Company Constitution:** [company-constitution.md](./company-constitution.md)
- **Evidence Format:** [evidence-format.md](./evidence-format.md)
- **COS System Prompt:** [system-prompt-v1.3.md](./system-prompt-v1.3.md)
- **LumenFlow Framework:** [../lumenflow/lumenflow-complete.md](../lumenflow/lumenflow-complete.md)

---

**Review Participants:**
- {Name} ({Role})
- {Name} ({Role})
- {Name} ({Role})

**Next Review:** {NEXT_REVIEW_DATE} (same day/time next week)
