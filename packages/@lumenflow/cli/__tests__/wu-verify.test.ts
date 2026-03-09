import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('wu-verify CLI (WU-2350)', () => {
  const srcPath = resolve(
    import.meta.dirname,
    '..',
    'src',
    'wu-verify.ts',
  );

  it('source file exists', () => {
    expect(existsSync(srcPath)).toBe(true);
  });

  it('imports verifyWUComplete from @lumenflow/agent/verification', async () => {
    const content = await import('node:fs').then((fs) =>
      fs.readFileSync(srcPath, 'utf-8'),
    );
    expect(content).toContain("from '@lumenflow/agent/verification'");
    expect(content).toContain('verifyWUComplete');
    expect(content).toContain('debugSummary');
  });

  it('uses --id option via arg-parser', async () => {
    const content = await import('node:fs').then((fs) =>
      fs.readFileSync(srcPath, 'utf-8'),
    );
    expect(content).toContain('WU_OPTIONS.id');
    expect(content).toContain('createWUParser');
  });

  it('does not hardcode agent package dist path', async () => {
    const content = await import('node:fs').then((fs) =>
      fs.readFileSync(srcPath, 'utf-8'),
    );
    expect(content).not.toContain('packages/@lumenflow/agent/dist');
  });
});
