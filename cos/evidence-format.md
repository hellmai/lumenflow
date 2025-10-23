# COS Evidence Format Specification

**Version:** 1.3
**Effective Date:** 2025-10-23

---

## Purpose

This document defines the grammar and matching rules for evidence types in the Company Operating System (COS). Evidence is how we prove compliance with governance rules.

---

## Evidence Types

COS supports 4 evidence types:

| Type | Format | Purpose | Example |
|------|--------|---------|---------|
| **link** | `link:identifier` | Reference to documentation, postmortem, VoC doc | `link:postmortem/incident-2025-10-15` |
| **metric** | `metric:name` | Quantitative measurement from telemetry | `metric:mttr_hours`, `metric:test_coverage_pct` |
| **screenshot** | `screenshot:subject` | Visual proof of UI/UX behavior | `screenshot:pricing_page`, `screenshot:cancellation_flow` |
| **approval** | `approval:reviewer@domain` | Human review approval for safety-critical work | `approval:tom@hellm.ai` |

---

## Grammar Rules

### General Format

```
<type>:<identifier>
```

- **type:** One of `link`, `metric`, `screenshot`, `approval`
- **identifier:** String identifying the specific evidence (no spaces, use underscores or hyphens)
- **No whitespace** around the colon

### Valid Examples

```yaml
evidence:
  - link:postmortem/incident-2025-10-15
  - metric:mttr_hours
  - screenshot:pricing_page
  - approval:tom@hellm.ai
```

### Invalid Examples

```yaml
# ❌ Wrong - space after colon
evidence:
  - link: postmortem/incident

# ❌ Wrong - no identifier
evidence:
  - link:

# ❌ Wrong - unknown type
evidence:
  - document:readme.md

# ❌ Wrong - spaces in identifier
evidence:
  - link:my postmortem
```

---

## Matching Logic (§6.1 Refinement)

COS gates use **prefix matching** and **substring matching** to verify evidence:

### Rule: `startsWith(evidence_item, required_prefix)`

Match if evidence item **starts with** the required prefix.

**Example:**
```yaml
# Rule requires:
required: ["link:postmortem"]

# These match:
✅ "link:postmortem/incident-2025-10-15"
✅ "link:postmortem/database-outage"
✅ "link:postmortem"

# These don't match:
❌ "link:voc_doc"
❌ "metric:mttr"
```

### Rule: `includes(evidence_item, required_substring)`

Match if evidence item **contains** the required substring anywhere.

**Example:**
```yaml
# Rule requires:
required: ["screenshot:pricing"]

# These match:
✅ "screenshot:pricing_page"
✅ "screenshot:new_pricing_flow"
✅ "screenshot:pricing"

# These don't match:
❌ "screenshot:cancellation"
❌ "link:pricing_doc"
```

### Combined Example

```yaml
# Rule requires:
required:
  - "link:postmortem"
  - "metric:mttr"
  - "screenshot:pricing"

# Provided evidence:
evidence:
  - "link:postmortem/incident-2025-10-15"  # ✅ starts with "link:postmortem"
  - "metric:mttr_hours"                    # ✅ starts with "metric:mttr"
  - "screenshot:pricing_page"              # ✅ contains "pricing"
  - "screenshot:cancellation_flow"         # ℹ️ extra (doesn't hurt)

# Result: ✅ PASS (all required evidence matched)
```

---

## Evidence Locations

Evidence must be stored in predictable locations for auditability:

### 1. Links (`link:*`)

**Location:** Project-specific documentation

**Examples:**
- `link:postmortem/2025-10-15` → `{PROJECT_ROOT}/docs/operations/postmortems/2025-10-15.md`
- `link:voc_doc/signup-friction` → `{PROJECT_ROOT}/docs/product/voc/signup-friction.md`
- `link:dpia/patient-data` → `{PROJECT_ROOT}/docs/compliance/dpia/patient-data.md`

**Validation:** COS gates check file exists at expected path.

### 2. Metrics (`metric:*`)

**Location:** Telemetry dashboard or WU YAML notes

**Examples:**
- `metric:mttr_hours` → Tracked in operating scoreboard (e.g., `mttr_hours: 2.3`)
- `metric:test_coverage_pct` → From CI output (e.g., `test_coverage_pct: 94`)
- `metric:deploy_frequency` → DORA metric (deploys per day)

**Validation:** Metric must be defined in scoreboard template or CI output.

### 3. Screenshots (`screenshot:*`)

**Location:** `{PROJECT_ROOT}/docs/evidence/screenshots/`

**Examples:**
- `screenshot:pricing_page` → `docs/evidence/screenshots/pricing_page.png`
- `screenshot:cancellation_flow` → `docs/evidence/screenshots/cancellation_flow.png`
- `screenshot:consent_dialog` → `docs/evidence/screenshots/consent_dialog.png`

**Validation:** Image file exists at expected path (`.png`, `.jpg`, or `.gif`).

### 4. Approvals (`approval:*`)

**Location:** WU YAML `notes` field or governance PR approval

**Examples:**
- `approval:tom@hellm.ai` → Human approval documented in WU notes
- `approval:jane@hellm.ai` → Code review approval on governance PR

**Validation:** Email matches team roster, approval timestamp within WU execution window.

---

## Phased Evidence Rollout (§5.1 Refinement)

COS v1.3 uses **phased rollout** to avoid blocking teams while telemetry matures.

### Initial Requirements (v1.3)

Start with **minimal** evidence. Add stricter requirements later as systems mature.

**Example:**

```yaml
# TRUTH-01: Postmortems for incidents
evidence:
  required:
    - "link:postmortem"  # ✅ Required now
  future:
    - "metric:mttr"      # 📅 Add when MTTR tracking ready
```

### Evidence Future Field

Rules can include `evidence_future` to document planned requirements:

```yaml
rules:
  - id: TRUTH-01
    statement: "All incidents require public postmortems"
    evidence:
      required: ["link:postmortem"]
      future: ["metric:mttr", "metric:incident_count"]
    notes: |
      v1.3: Only postmortem link required
      v1.4: Will add MTTR and incident count metrics when telemetry ready
```

This prevents over-engineering gates before systems are ready.

---

## STOP-AND-ASK Evidence (§7 Refinement)

Safety-critical work requires human approval **before** marking WU done.

### When Required

STOP-AND-ASK applies to:
- **Safety:** Self-harm, suicide, emergency detection
- **Privacy:** PHI, PII, GDPR compliance
- **Auth/Permissions:** Access control, sensitive operations
- **Spend/Budget:** High-cost commitments, budget impact

### Evidence Format

```yaml
evidence:
  - "approval:{REVIEWER_EMAIL}"

notes: |
  STOP-AND-ASK approval received from {REVIEWER_NAME} on {DATE}
  Review covered: [specific safety/privacy/auth/spend concerns]
  Approval documented in: [link to review notes]
```

### Timing

Approval must be documented **before** `wu:done` runs. The reviewer adds the approval evidence after review is complete.

**Example:**
```yaml
# 1. Agent completes implementation, adds STOP-AND-ASK note
notes: |
  Implementation complete. Requesting STOP-AND-ASK review for:
  - Red flag detection changes (safety-critical)
  - PHI handling in new feature (privacy-critical)

# 2. Reviewer reviews, approves, updates WU YAML
evidence:
  - "approval:tom@hellm.ai"

notes: |
  STOP-AND-ASK approval granted by Tom on 2025-10-23
  Verified red flag detection maintains >98% recall
  Confirmed PHI handling follows GDPR data minimization
  Safe to mark done.

# 3. Agent runs wu:done (only after approval added)
```

---

## Validation Rules

COS gates (`cos-gates.mjs`) validate evidence using these rules:

1. **Format Check:** Evidence matches `<type>:<identifier>` grammar
2. **Type Check:** Type is one of 4 allowed types
3. **Matching Check:** Uses `startsWith` or `includes` per required evidence
4. **Location Check:** Files/metrics exist at expected locations
5. **Completeness Check:** All required evidence provided (not just some)

**Exit Codes:**
- `0` - All evidence valid and complete
- `1` - Evidence missing, invalid format, or files not found

---

## Migration from Regex to COS

**Before COS (regex-based):**
```yaml
# Brittle - typos break validation
evidence:
  - "postmortem: incident-2025-10-15"  # Space breaks regex
  - "MTTR: 2.3 hours"                  # Uppercase breaks regex
```

**After COS v1.3 (grammar-based):**
```yaml
# Standardized - clear grammar, predictable validation
evidence:
  - "link:postmortem/incident-2025-10-15"
  - "metric:mttr_hours"
```

---

## References

- **COS System Prompt:** [system-prompt-v1.3.md](./system-prompt-v1.3.md)
- **Company Constitution:** [company-constitution.md](./company-constitution.md)
- **Governance Rules:** [rules/hellmai-core-rules.yaml](./rules/hellmai-core-rules.yaml)
- **Gates Implementation:** `tools/cos-gates.mjs` (created in WU-613)

---

## Version History

### v1.3 (2025-10-23)
- **Refinement 1:** Added explicit matching logic (startsWith/includes) in §6.1
- **Refinement 2:** Added phased rollout with `evidence_future` field in §5.1
- **Refinement 3:** Added STOP-AND-ASK approval workflow in §7
- **Refinement 4:** Clarified WU-613 deliverable (this document)
- **Refinement 5:** Simplified ritual evidence (GOV-WEEKLY needs no proof)

### v1.0 (2025-10-15)
- Initial evidence format specification
- 4 evidence types defined (link, metric, screenshot, approval)
