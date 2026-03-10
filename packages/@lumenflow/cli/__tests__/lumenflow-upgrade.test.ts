// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * @file lumenflow-upgrade.test.ts
 * WU-2226: Tests for pnpm script sync during lumenflow:upgrade
 *
 * TDD: These tests are written BEFORE the implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Functions under test (to be implemented)
import { syncScriptsToPackageJson, checkDocsStaleness } from '../src/lumenflow-upgrade.js';
import { generateScriptsFromManifest } from '../src/public-manifest.js';
import { loadTemplate, processTemplate, CORE_DOC_TEMPLATE_PATHS } from '../src/docs-sync.js';

describe('WU-2226: syncScriptsToPackageJson', () => {
  const tmpDir = path.join(process.cwd(), '__test-tmp-wu2226__');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds missing pnpm script entries from public manifest', () => {
    // Arrange: package.json with only a few scripts
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      scripts: {
        'wu:create': 'wu-create',
        'wu:claim': 'wu-claim',
      },
      devDependencies: {
        '@lumenflow/cli': '^3.6.0',
      },
    };
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));

    // Act
    const result = syncScriptsToPackageJson(tmpDir);

    // Assert: new scripts were added
    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // wu:done should now be present (it's in the manifest but wasn't in original)
    expect(updated.scripts['wu:done']).toBe('wu-done');
    // wu:prep should now be present
    expect(updated.scripts['wu:prep']).toBe('wu-prep');
    // gates should now be present
    expect(updated.scripts['gates']).toBe('gates');
    // Result should indicate scripts were added
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.added).toContain('wu:done');
  });

  it('preserves existing script entries (does not overwrite)', () => {
    // Arrange: package.json with a customized script
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      scripts: {
        'wu:create': 'custom-wu-create --verbose',
        gates: 'my-custom-gates',
      },
      devDependencies: {
        '@lumenflow/cli': '^3.6.0',
      },
    };
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));

    // Act
    syncScriptsToPackageJson(tmpDir);

    // Assert: existing scripts are untouched
    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(updated.scripts['wu:create']).toBe('custom-wu-create --verbose');
    expect(updated.scripts['gates']).toBe('my-custom-gates');
  });

  it('returns no-op when all manifest scripts are already present', () => {
    // Arrange: package.json that already has all manifest scripts
    const allScripts = generateScriptsFromManifest();

    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      scripts: { ...allScripts },
      devDependencies: {
        '@lumenflow/cli': '^3.6.0',
      },
    };
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));

    // Act
    const result = syncScriptsToPackageJson(tmpDir);

    // Assert: nothing added
    expect(result.added).toEqual([]);
    expect(result.modified).toBe(false);
  });

  it('does not remove scripts that exist in consumer but not in manifest', () => {
    // Arrange: package.json with custom non-manifest scripts
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      scripts: {
        'my-custom-script': 'echo hello',
        test: 'vitest',
        build: 'tsc',
      },
      devDependencies: {
        '@lumenflow/cli': '^3.6.0',
      },
    };
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));

    // Act
    syncScriptsToPackageJson(tmpDir);

    // Assert: custom scripts are still there
    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(updated.scripts['my-custom-script']).toBe('echo hello');
    expect(updated.scripts['test']).toBe('vitest');
    expect(updated.scripts['build']).toBe('tsc');
  });

  it('creates scripts object if package.json has none', () => {
    // Arrange: package.json without scripts section
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      devDependencies: {
        '@lumenflow/cli': '^3.6.0',
      },
    };
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));

    // Act
    const result = syncScriptsToPackageJson(tmpDir);

    // Assert: scripts were created and populated
    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(updated.scripts).toBeDefined();
    expect(typeof updated.scripts).toBe('object');
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.modified).toBe(true);
  });

  it('uses the same script patterns as init (SCRIPT_ARG_OVERRIDES)', () => {
    // Arrange: package.json missing gates:docs
    const packageJson = {
      name: 'test-project',
      version: '1.0.0',
      scripts: {},
      devDependencies: {
        '@lumenflow/cli': '^3.6.0',
      },
    };
    const pkgPath = path.join(tmpDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify(packageJson, null, 2));

    // Act
    syncScriptsToPackageJson(tmpDir);

    // Assert: gates:docs uses the override pattern (same as init)
    const updated = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(updated.scripts['gates:docs']).toBe('gates --docs-only');
  });
});

describe('WU-2366: checkDocsStaleness', () => {
  let staleTmpDir: string;

  beforeEach(() => {
    staleTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumenflow-staleness-test-'));
  });

  afterEach(() => {
    fs.rmSync(staleTmpDir, { recursive: true, force: true });
  });

  it('should detect stale docs when on-disk content differs from template', () => {
    // Write stale content for each core doc
    fs.writeFileSync(path.join(staleTmpDir, 'LUMENFLOW.md'), '# Old LUMENFLOW content');
    fs.writeFileSync(path.join(staleTmpDir, 'AGENTS.md'), '# Old AGENTS content');
    fs.mkdirSync(path.join(staleTmpDir, '.lumenflow'), { recursive: true });
    fs.writeFileSync(path.join(staleTmpDir, '.lumenflow', 'constraints.md'), '# Old constraints');

    const result = checkDocsStaleness(staleTmpDir);

    expect(result.stale).toBe(true);
    expect(result.staleFiles.length).toBeGreaterThan(0);
  });

  it('should report no staleness when hashes match', () => {
    // Write content that matches what processTemplate would produce
    const currentDate = new Date().toISOString().split('T')[0];
    const tokens = { DATE: currentDate };

    for (const [outputFile, templatePath] of Object.entries(CORE_DOC_TEMPLATE_PATHS)) {
      const templateContent = loadTemplate(templatePath);
      const processedContent = processTemplate(templateContent, tokens);
      const filePath = path.join(staleTmpDir, outputFile);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, processedContent);
    }

    const result = checkDocsStaleness(staleTmpDir);

    expect(result.stale).toBe(false);
    expect(result.staleFiles).toEqual([]);
  });

  it('should report stale when file does not exist on disk', () => {
    // Don't create any files — empty directory
    const result = checkDocsStaleness(staleTmpDir);

    expect(result.stale).toBe(true);
    expect(result.staleFiles).toContain('LUMENFLOW.md');
    expect(result.staleFiles).toContain('AGENTS.md');
    expect(result.staleFiles).toContain('.lumenflow/constraints.md');
  });
});
