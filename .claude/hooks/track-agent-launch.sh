#!/bin/bash
#
# track-agent-launch.sh (WU-1612)
#
# PostToolUse hook for the Task tool.
# Records each sub-agent launch as a mem:signal so the memory layer
# can surface active agents in recovery context after compaction.
#
# The existing PreCompact / SessionStart hooks already include recent
# signals in recovery output, so this single hook closes the gap where
# compacted agents forget their running sub-agents.
#
# No-op when:
#   - CLAUDE_PROJECT_DIR is unset (not in a project)
#   - .lumenflow directory doesn't exist
#   - No active WU in context (mem:signal requires --wu)
#   - Agent ID cannot be parsed from tool response
#
# Performance: single Python parse + one pnpm mem:signal call (~200ms).
# Always exits 0 (informational only, never blocks).
#
# Exit codes:
#   0 = Always (never blocks)
#

# Fail-open: errors must never block Task execution
set +e

# Derive repo paths
if [[ -z "${CLAUDE_PROJECT_DIR:-}" ]]; then
  cat > /dev/null 2>/dev/null || true
  exit 0
fi

REPO_PATH="$CLAUDE_PROJECT_DIR"
LUMENFLOW_DIR="${REPO_PATH}/.lumenflow"

# No-op if LumenFlow is not configured
if [[ ! -d "$LUMENFLOW_DIR" ]]; then
  cat > /dev/null 2>/dev/null || true
  exit 0
fi

# Detect active WU from git branch name (fast, no pnpm dependency).
# Lane branches follow pattern: lane/<lane-slug>/wu-NNNN
BRANCH=$(git -C "$REPO_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
WU_ID=$(python3 -c "
import re
branch = '$BRANCH'
m = re.search(r'(wu-\d+)', branch, re.IGNORECASE)
print(m.group(1).upper() if m else '')
" 2>/dev/null || true)

# No-op if no active WU (mem:signal requires --wu, and recovery is WU-scoped)
if [[ -z "$WU_ID" ]]; then
  cat > /dev/null 2>/dev/null || true
  exit 0
fi

# Read JSON input from stdin
INPUT=$(cat 2>/dev/null || true)

if [[ -z "$INPUT" ]]; then
  exit 0
fi

# Parse agent launch details from PostToolUse JSON
# Pass input via env var + heredoc to avoid shell injection from untrusted JSON
export _HOOK_INPUT="$INPUT"
PARSED=$(python3 << 'PYEOF'
import json, sys, os

try:
    raw = os.environ.get('_HOOK_INPUT', '')
    data = json.loads(raw)
    tool_input = data.get('tool_input', {})
    tool_response = data.get('tool_response', {})

    agent_id = ''
    if isinstance(tool_response, dict):
        agent_id = tool_response.get('agent_id', '')
    elif isinstance(tool_response, str):
        import re
        m = re.search(r'agentId:\s*(\S+)', tool_response)
        if m:
            agent_id = m.group(1)

    description = tool_input.get('description', '')
    subagent_type = tool_input.get('subagent_type', '')
    background = tool_input.get('run_in_background', False)

    output_file = ''
    if isinstance(tool_response, dict):
        output_file = tool_response.get('output_file', '')

    if agent_id:
        parts = [agent_id, description, subagent_type, str(background).lower()]
        if output_file:
            parts.append(output_file)
        print('|'.join(parts))
except Exception:
    pass
PYEOF
)

# If parsing failed or no agent ID, exit silently
if [[ -z "$PARSED" ]]; then
  exit 0
fi

# Split parsed fields
IFS='|' read -r AGENT_ID DESCRIPTION SUBAGENT_TYPE BACKGROUND OUTPUT_FILE <<< "$PARSED"

# Build signal message
MSG="agent-launch: ${AGENT_ID} (${SUBAGENT_TYPE}): ${DESCRIPTION}"
if [[ "$BACKGROUND" == "true" && -n "$OUTPUT_FILE" ]]; then
  MSG="${MSG} [background: ${OUTPUT_FILE}]"
fi

# Record via mem:signal (synchronous with timeout to avoid blocking)
cd "$REPO_PATH" && timeout 5 pnpm mem:signal "$MSG" --wu "$WU_ID" --quiet 2>/dev/null || true

exit 0
