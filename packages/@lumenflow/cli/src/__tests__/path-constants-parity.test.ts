// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { WORKSPACE_CONFIG_FILE_NAME } from '@lumenflow/core/config';
import { CONFIG_FILES } from '@lumenflow/core/wu-constants';
import { WORKSPACE_FILE_NAME } from '@lumenflow/kernel/shared-constants';

describe('path constants parity', () => {
  it('keeps workspace config filename aligned across core and kernel packages', () => {
    expect(CONFIG_FILES.WORKSPACE_CONFIG).toBe(WORKSPACE_CONFIG_FILE_NAME);
    expect(WORKSPACE_FILE_NAME).toBe(WORKSPACE_CONFIG_FILE_NAME);
  });
});
