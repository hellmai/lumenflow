import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd().endsWith(path.join('apps', 'web'))
  ? process.cwd()
  : path.resolve(process.cwd(), 'apps/web');
const UI_ROOT = path.join(WEB_ROOT, 'src/components/ui');

const REQUIRED_COMPONENT_FILES = [
  'badge.tsx',
  'button.tsx',
  'card.tsx',
  'dialog.tsx',
  'dropdown-menu.tsx',
  'form.tsx',
  'input.tsx',
  'label.tsx',
  'select.tsx',
  'separator.tsx',
  'sonner.tsx',
  'tabs.tsx',
  'textarea.tsx',
] as const;

describe('shadcn foundation', () => {
  it('ships required ui primitives', () => {
    for (const componentFile of REQUIRED_COMPONENT_FILES) {
      const filePath = path.join(UI_ROOT, componentFile);
      expect(existsSync(filePath), `${componentFile} should exist`).toBe(true);
    }
  });

  it('includes form dependencies', () => {
    const packageJsonPath = path.join(WEB_ROOT, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.['react-hook-form']).toBeTruthy();
    expect(packageJson.dependencies?.['@hookform/resolvers']).toBeTruthy();
  });
});
