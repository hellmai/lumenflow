// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as lifecycleModule from '../lifecycle/index.js';
import * as delegationModule from '../delegation/index.js';
import * as validationModule from '../validation/index.js';
import * as contextModule from '../context/index.js';
import * as domainModule from '../domain/index.js';

const PACKAGE_JSON_RELATIVE_PATH = '../../package.json';
const PACKAGE_JSON_ENCODING: BufferEncoding = 'utf-8';

const CORE_SUBPATH_EXPORT_KEYS = Object.freeze([
  './lifecycle',
  './delegation',
  './validation',
  './context',
  './domain',
]);

function readCorePackageJsonExports(): Record<string, string> {
  const packageJsonPath = path.resolve(import.meta.dirname, PACKAGE_JSON_RELATIVE_PATH);
  const packageJsonRaw = readFileSync(packageJsonPath, PACKAGE_JSON_ENCODING);
  const packageJson = JSON.parse(packageJsonRaw) as { exports: Record<string, string> };
  return packageJson.exports;
}

describe('WU-2169: domain-scoped core barrels', () => {
  it('declares domain-scoped subpath exports in package.json', () => {
    const exportsField = readCorePackageJsonExports();

    for (const exportKey of CORE_SUBPATH_EXPORT_KEYS) {
      expect(exportsField).toHaveProperty(exportKey);
    }
  });

  it('exposes lifecycle barrel symbols', () => {
    expect(lifecycleModule.checkLaneFree).toBeTypeOf('function');
    expect(lifecycleModule.validateWU).toBeTypeOf('function');
  });

  it('exposes delegation barrel symbols', () => {
    expect(delegationModule.buildDelegationTree).toBeTypeOf('function');
    expect(delegationModule.DelegationRegistryStore).toBeTypeOf('function');
  });

  it('exposes validation, context, and domain barrel symbols', () => {
    expect(validationModule.validateCommand).toBeTypeOf('function');
    expect(contextModule.computeContext).toBeTypeOf('function');
    expect(domainModule.LocationType).toBeDefined();
  });
});
