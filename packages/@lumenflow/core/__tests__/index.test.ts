import { describe, it, expect } from 'vitest';

describe('@lumenflow/core', () => {
  it('exports VERSION constant', async () => {
    const { VERSION } = await import('../src/index.js');
    expect(VERSION).toBe('0.0.0');
  });
});
