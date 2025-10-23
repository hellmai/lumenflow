# Framework Adoption Guide

This guide walks you through adopting LumenFlow v2.0 and COS v1.3 frameworks in your product.

**Prerequisites:**
- Git repository with main branch
- Node.js project with package.json
- Basic familiarity with YAML and git workflows

**Time estimate:** 1-2 hours for initial setup

---

## Step 1: Clone hellmai/os to Temporary Directory

Clone the framework repository to review its contents before copying:

```bash
# Clone to temporary directory
git clone git@github.com:hellmai/os.git /tmp/hellmai-os

# Review the structure
ls -la /tmp/hellmai-os/
# lumenflow/  - LumenFlow v2.0 framework docs
# cos/        - COS v1.3 governance system
# templates/  - Configuration templates
# README.md   - Framework overview
# VERSION     - Current version
```

**What you're getting:**
- LumenFlow v2.0: Workflow framework (worktree discipline, WIP=1, TDD-first)
- COS v1.3: Company Operating System with governance rules
- Templates: Config files and WU templates
- Documentation: Complete framework specifications

---

## Step 2: Copy to Project's `docs/04-operations/_frameworks/`

Copy the framework to your project's documentation directory:

```bash
# Navigate to your project
cd /path/to/your/project

# Create frameworks directory
mkdir -p docs/04-operations/_frameworks

# Copy hellmai/os contents
cp -r /tmp/hellmai-os/* docs/04-operations/_frameworks/

# Commit the frameworks
git add docs/04-operations/_frameworks/
git commit -m "docs: import hellmai/os frameworks (lumenflow v2.0 + cos v1.3)"

# Remove temporary clone
rm -rf /tmp/hellmai-os
```

**Directory structure after copy:**
```
docs/04-operations/
  _frameworks/
    lumenflow/           # LumenFlow v2.0 docs
    cos/                 # COS v1.3 governance
      rules/
        hellmai-core-rules.yaml  # Company-wide rules
      system-prompt-v1.3.md
      evidence-format.md
    templates/           # Config templates
    README.md
    VERSION
```

**Note:** The `_frameworks/` prefix (underscore) indicates this is imported documentation, not project-specific.

---

## Step 3: Create `.lumenflow.config.yaml` from Template

Create your project's LumenFlow configuration:

```bash
# Copy template to project root
cp docs/04-operations/_frameworks/templates/lumenflow.config.yaml .lumenflow.config.yaml

# Edit with your project details
nano .lumenflow.config.yaml
```

**Required configuration:**

```yaml
# Change these to match your project
company: "YourCompanyName"   # e.g., "HellmAI"
project: "YourProjectName"   # e.g., "ExampleApp"

# Update governance parameters
governance:
  parameters:
    SPEND_THRESHOLD: 500        # Adjust based on your budget
    OWNER_EMAIL: "you@example.com"  # Your email for approvals

# Configure your engineering lanes
lanes:
  engineering:
    - name: "Discovery"
      description: "Research and proof-of-concepts"
      wip_limit: 1
    - name: "Main"
      description: "Core product features"
      wip_limit: 1
  operations:
    - name: "Operations"
      description: "Infrastructure and tooling"
      wip_limit: 1
```

**Commit the config:**

```bash
git add .lumenflow.config.yaml
git commit -m "config: add lumenflow v2.0 configuration"
```

---

## Step 4: Create `project-rules.yaml` Extending Core Rules

Create project-specific governance rules:

```bash
# Create governance directory
mkdir -p docs/04-operations/governance

# Copy template
cp docs/04-operations/_frameworks/templates/project-rules.yaml \
   docs/04-operations/governance/project-rules.yaml

# Edit with your project-specific rules
nano docs/04-operations/governance/project-rules.yaml
```

**What to include:**
- Compliance rules specific to your industry (e.g., HIPAA, GDPR, SOC2)
- Technical standards unique to your architecture
- Security requirements beyond company-wide rules
- Product-specific quality gates

**Example project-specific rule:**

```yaml
extends: "_frameworks/cos/rules/hellmai-core-rules.yaml"

rules:
  - id: MYPROJECT-01
    kind: guardrail
    statement: "All API endpoints require rate limiting and authentication"
    evidence:
      required:
        - "link:api_spec"
        - "screenshot:rate_limit_config"
      future:
        - "metric:api_auth_success_rate"
    gate: "cos:narrative"
    notes: |
      Required for SOC2 compliance and DoS protection.
      API spec must document rate limits and auth mechanisms.
```

**Guidelines:**
- Start with 1-3 project-specific rules (don't over-engineer)
- Use phased rollout (minimal evidence now, metrics later)
- Only add rules when enforcement is needed (not for guidance)
- Document business context in notes (compliance, risk, cost)

**Commit the rules:**

```bash
git add docs/04-operations/governance/project-rules.yaml
git commit -m "docs: add project-specific cos governance rules"
```

---

## Step 5: Copy/Implement WU Management Tools

Implement the WU workflow tools for your project:

### Option A: Copy from ExampleApp (recommended)

If you're also using Node.js/pnpm:

```bash
# Copy WU tools from ExampleApp reference implementation
# (assumes you have access to ExampleApp repo)
mkdir -p tools
cp /path/to/exampleapp/tools/wu-claim.mjs tools/
cp /path/to/exampleapp/tools/wu-done.mjs tools/
cp /path/to/exampleapp/tools/cos-gates.mjs tools/
cp /path/to/exampleapp/tools/lib/*.mjs tools/lib/

# Add scripts to package.json
```

**Add to `package.json`:**

```json
{
  "scripts": {
    "wu:claim": "node tools/wu-claim.mjs",
    "wu:done": "node tools/wu-done.mjs",
    "gates": "node tools/cos-gates.mjs"
  }
}
```

### Option B: Implement Your Own

If you're using a different stack, implement the core workflow:

**Required tools:**

1. **wu:claim** - Claim a work unit
   - Create git worktree at `worktrees/{lane}-{wu-id}`
   - Create branch `lane/{lane}/{wu-id}`
   - Update status.md and backlog.md
   - Create session lock (`.beacon/sessions/{WU-ID}.lock`)

2. **wu:done** - Complete a work unit
   - Run COS gates (if governance enabled)
   - Merge lane branch to main (fast-forward only)
   - Update WU YAML (status=done, completed date)
   - Create completion stamp (`.beacon/stamps/{WU-ID}.done`)
   - Remove worktree
   - Archive session lock

3. **cos:gates** - Run governance checks
   - Load rules from config
   - Validate evidence for applicable rules
   - Return pass/fail status

**See:** `docs/04-operations/_frameworks/lumenflow/` for complete workflow specification.

### Git Hooks (Optional but Recommended)

Set up git hooks to enforce workflow discipline:

```bash
# Copy hooks from ExampleApp (or implement your own)
mkdir -p .husky
cp /path/to/exampleapp/.husky/pre-commit .husky/
cp /path/to/exampleapp/.husky/commit-msg .husky/

# Install husky
npm install --save-dev husky
npx husky install
```

**Recommended hooks:**
- `pre-commit`: Run format, lint, typecheck
- `commit-msg`: Validate conventional commits, enforce worktree discipline
- `pre-push`: Run tests, verify no lock files

**Commit the tools:**

```bash
git add tools/ package.json .husky/
git commit -m "feat: add lumenflow wu management tools"
```

---

## Verification Checklist

After completing all 5 steps, verify your setup:

- [ ] Frameworks copied to `docs/04-operations/_frameworks/`
- [ ] `.lumenflow.config.yaml` created and configured
- [ ] `project-rules.yaml` created with at least 1 project-specific rule
- [ ] WU tools implemented (`wu:claim`, `wu:done`, `cos:gates`)
- [ ] Git hooks installed (optional)
- [ ] All changes committed to main branch

**Test your setup:**

```bash
# Create a test WU
mkdir -p docs/04-operations/tasks/wu
cp docs/04-operations/_frameworks/templates/wu-template.yaml \
   docs/04-operations/tasks/wu/WU-001.yaml

# Edit WU-001.yaml with test values
nano docs/04-operations/tasks/wu/WU-001.yaml

# Try claiming it
pnpm wu:claim --id WU-001 --lane Main

# Verify worktree created
ls worktrees/
# Should show: main-wu-001/

# Make a small change in the worktree
cd worktrees/main-wu-001
echo "# Test" > TEST.md
git add TEST.md
git commit -m "test: verify workflow"

# Complete the WU
cd ../..
pnpm wu:done --id WU-001

# Verify completion
cat .beacon/stamps/WU-001.done
# Should show completion timestamp
```

---

## Next Steps

1. **Read the framework docs:**
   - [LumenFlow Complete Framework](docs/04-operations/_frameworks/lumenflow/lumenflow-complete.md)
   - [COS System Prompt v1.3](docs/04-operations/_frameworks/cos/system-prompt-v1.3.md)

2. **Customize for your project:**
   - Add more lanes to `.lumenflow.config.yaml` if needed
   - Add project-specific rules to `project-rules.yaml`
   - Configure gates enforcement based on your workflow

3. **Create your first real WU:**
   - Use the template in `docs/04-operations/_frameworks/templates/wu-template.yaml`
   - Follow the LumenFlow discipline (worktree, WIP=1, TDD-first)
   - Run COS gates before completion

4. **Set up AI agent integration (optional):**
   - Configure Claude Code with LumenFlow context
   - Add `ai/onboarding/starting-prompt.md` pointing to frameworks
   - Enable COS governance in agent workflows

---

## Troubleshooting

### Worktree creation fails
**Problem:** `git worktree add` fails with "already exists"
**Solution:** Remove stale worktree: `git worktree remove worktrees/{lane}-{wu-id} --force`

### COS gates fail
**Problem:** `cos:gates` fails with "rule not found"
**Solution:** Verify `rules_files` paths in `.lumenflow.config.yaml` are correct

### Session lock mismatch
**Problem:** `wu:done` fails with "session ownership mismatch"
**Solution:** Use `pnpm wu:takeover --id WU-XXX` if session is stale (>2 minutes)

### Fast-forward merge fails
**Problem:** `wu:done` fails with "cannot fast-forward"
**Solution:** Rebase your lane branch: `git rebase main` from worktree

---

## Support

- **Framework issues:** Open issue at [github.com/hellmai/os](https://github.com/hellmai/os)
- **Questions:** See framework docs in `docs/04-operations/_frameworks/`
- **ExampleApp reference:** [github.com/hellmai/exampleapp](https://github.com/hellmai/exampleapp) (if you have access)

---

**Version:** LumenFlow v2.0 + COS v1.3
**Last updated:** 2025-10-23
