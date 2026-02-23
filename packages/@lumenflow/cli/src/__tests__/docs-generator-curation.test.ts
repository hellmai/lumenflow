// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { getDocsVisibleManifest } from '../public-manifest.js';
import {
  extractCommandMetadata,
  generateCliMdx,
} from '../../../../../tools/generate-cli-docs.ts';

describe('CLI docs generator curation', () => {
  it('renders primary command surface only', () => {
    const docsManifest = getDocsVisibleManifest();
    const commands = extractCommandMetadata(docsManifest);
    const output = generateCliMdx(commands);

    expect(output).toContain('### wu:create');
    expect(output).toContain('### gates');

    expect(output).not.toContain('### gates:docs');
    expect(output).not.toContain('### lumenflow-gates');
    expect(output).not.toContain('### onboard');
    expect(output).not.toContain('### workspace:init');
  });
});
