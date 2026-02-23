// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Generate the Completion Workflow section for sub-agents (WU-2682).
 *
 * Explicitly instructs sub-agents to run wu:done autonomously after gates pass.
 * This prevents agents from asking permission instead of completing.
 *
 * @param {string} id - WU ID
 * @returns {string} Completion Workflow section
 */
const COMPLETION_COMMANDS = {
  GATES: 'pnpm gates',
  STATUS_PREFIX: 'pnpm wu:status --id',
  DONE_PREFIX: 'pnpm wu:done --id',
  RECOVER_PREFIX: 'pnpm wu:recover --id',
} as const;

const WU_STATUS_VALUES = {
  DONE: 'done',
  IN_PROGRESS: 'in_progress',
} as const;

function formatWuCommand(commandPrefix: string, id: string): string {
  return `${commandPrefix} ${id}`;
}

export function generateCompletionWorkflowSection(id: string): string {
  const statusCommand = formatWuCommand(COMPLETION_COMMANDS.STATUS_PREFIX, id);
  const doneCommand = formatWuCommand(COMPLETION_COMMANDS.DONE_PREFIX, id);
  const recoverCommand = formatWuCommand(COMPLETION_COMMANDS.RECOVER_PREFIX, id);

  return `## Completion Workflow

**CRITICAL: Complete autonomously. Do NOT ask for permission.**

After all acceptance criteria are satisfied:

1. Run gates in the worktree: \`${COMPLETION_COMMANDS.GATES}\`
2. If gates pass, cd back to main checkout
3. Verify status from main: \`${statusCommand}\`
4. If status is \`${WU_STATUS_VALUES.DONE}\`, stop and report already completed.
   do NOT run \`${doneCommand}\`.
   do NOT run \`${recoverCommand}\`.
5. If status is \`${WU_STATUS_VALUES.IN_PROGRESS}\`, continue autonomously with \`${doneCommand}\`.

\`\`\`bash
# From worktree, after gates pass:
cd /path/to/main  # NOT the worktree
${statusCommand}

# Status decision:
# - done: report already completed, stop.
# - in_progress: complete now.
${doneCommand}
\`\`\`

**wu:done** handles: merge to main, stamp creation, worktree cleanup.

**Do not ask** "should I run wu:done?" — just run it when gates pass.`;
}
