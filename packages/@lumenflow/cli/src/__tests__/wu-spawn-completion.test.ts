// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { generateCompletionWorkflowSection } from '../wu-spawn-completion.js';

const TEST_WU_ID = 'WU-2058';

describe('WU-2058: generateCompletionWorkflowSection', () => {
  it('requires a status check before wu:done', () => {
    const section = generateCompletionWorkflowSection(TEST_WU_ID);

    expect(section).toContain(`pnpm wu:status --id ${TEST_WU_ID}`);
    expect(section).toContain('If status is `done`');
    expect(section).toContain(`do NOT run \`pnpm wu:done --id ${TEST_WU_ID}\``);
    expect(section).toContain(`do NOT run \`pnpm wu:recover --id ${TEST_WU_ID}\``);
  });

  it('keeps autonomous completion when status is in_progress', () => {
    const section = generateCompletionWorkflowSection(TEST_WU_ID);

    expect(section).toContain('If status is `in_progress`, continue autonomously');
    expect(section).toContain(`pnpm wu:done --id ${TEST_WU_ID}`);
  });
});
