/**
 * @file commands.test.ts
 * Tests for lumenflow commands discovery feature (WU-1378)
 *
 * Tests the new commands subcommand that lists all available CLI commands
 * grouped by category with brief descriptions.
 */

import { describe, it, expect } from 'vitest';
import { getCommandsRegistry, formatCommandsOutput, type CommandCategory } from '../commands.js';

describe('lumenflow commands', () => {
  describe('getCommandsRegistry', () => {
    it('should return command categories', () => {
      const registry = getCommandsRegistry();

      expect(registry).toBeDefined();
      expect(Array.isArray(registry)).toBe(true);
      expect(registry.length).toBeGreaterThan(0);
    });

    it('should include WU Lifecycle category with key commands', () => {
      const registry = getCommandsRegistry();
      const wuLifecycle = registry.find((cat: CommandCategory) => cat.name === 'WU Lifecycle');

      expect(wuLifecycle).toBeDefined();
      expect(wuLifecycle!.commands).toBeDefined();

      const commandNames = wuLifecycle!.commands.map((cmd) => cmd.name);
      expect(commandNames).toContain('wu:create');
      expect(commandNames).toContain('wu:claim');
    });

    it('should include Initiatives category', () => {
      const registry = getCommandsRegistry();
      const initiatives = registry.find((cat: CommandCategory) => cat.name === 'Initiatives');

      expect(initiatives).toBeDefined();
      expect(initiatives!.commands.some((cmd) => cmd.name === 'initiative:create')).toBe(true);
    });

    it('should include Gates & Quality category with gates command', () => {
      const registry = getCommandsRegistry();
      const gatesCategory = registry.find((cat: CommandCategory) => cat.name === 'Gates & Quality');

      expect(gatesCategory).toBeDefined();
      expect(gatesCategory!.commands.some((cmd) => cmd.name === 'gates')).toBe(true);
    });

    it('should have description for each command', () => {
      const registry = getCommandsRegistry();

      for (const category of registry) {
        for (const cmd of category.commands) {
          expect(cmd.description).toBeDefined();
          expect(cmd.description.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('formatCommandsOutput', () => {
    it('should include category headers', () => {
      const output = formatCommandsOutput();

      expect(output).toContain('WU Lifecycle');
      expect(output).toContain('Initiatives');
      expect(output).toContain('Gates & Quality');
    });

    it('should include command names and descriptions', () => {
      const output = formatCommandsOutput();

      expect(output).toContain('wu:create');
      expect(output).toContain('wu:claim');
      expect(output).toContain('initiative:create');
      expect(output).toContain('gates');
    });

    it('should include hint to run --help for details', () => {
      const output = formatCommandsOutput();

      expect(output).toMatch(/--help/i);
    });

    it('should format output with clear grouping', () => {
      const output = formatCommandsOutput();
      const lines = output.split('\n');

      // Should have multiple non-empty lines
      const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
      expect(nonEmptyLines.length).toBeGreaterThan(10);
    });
  });
});
