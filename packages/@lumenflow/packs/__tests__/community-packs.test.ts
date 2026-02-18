// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

// ---- shared helpers --------------------------------------------------------

interface ManifestTool {
  name: string;
  entry: string;
  permission: string;
  required_scopes: Array<{ type: string; pattern: string; access: string }>;
}

interface ManifestPolicy {
  id: string;
  trigger: string;
  decision: string;
}

interface PackManifest {
  id: string;
  version: string;
  task_types: string[];
  tools: ManifestTool[];
  policies: ManifestPolicy[];
  evidence_types: string[];
  state_aliases: Record<string, string>;
  lane_templates: Array<{ id: string }>;
}

const PENDING_RUNTIME_ENTRY = 'tool-impl/pending-runtime-tools.ts#pendingRuntimeMigrationTool';

function assertCommonManifestShape(manifest: PackManifest, id: string): void {
  expect(manifest.id).toBe(id);
  expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(manifest.task_types.length).toBeGreaterThanOrEqual(1);
  expect(manifest.tools.length).toBeGreaterThanOrEqual(1);
  expect(manifest.policies.length).toBeGreaterThanOrEqual(1);
  expect(manifest.evidence_types.length).toBeGreaterThanOrEqual(1);
  expect(manifest.state_aliases).toEqual({ active: 'in_progress' });
  expect(manifest.lane_templates).toEqual([]);
}

function assertAllToolsUseStubEntry(manifest: PackManifest): void {
  for (const tool of manifest.tools) {
    expect(tool.entry).toBe(PENDING_RUNTIME_ENTRY);
  }
}

function assertToolScopesMatchPermissions(manifest: PackManifest): void {
  for (const tool of manifest.tools) {
    expect(tool.required_scopes).toHaveLength(1);
    const scope = tool.required_scopes[0];
    expect(scope.type).toBe('path');
    expect(scope.pattern).toBe('**');
    expect(scope.access).toBe(tool.permission === 'read' ? 'read' : 'write');
  }
}

// ---- data-pipeline ---------------------------------------------------------

describe('data-pipeline pack manifest', () => {
  const loadManifest = async () =>
    (await import('../data-pipeline/manifest.js')) as {
      DATA_PIPELINE_MANIFEST: PackManifest;
    };

  it('exports DATA_PIPELINE_MANIFEST with correct id and version', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    expect(DATA_PIPELINE_MANIFEST.id).toBe('data-pipeline');
    expect(DATA_PIPELINE_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares exactly 4 tools', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    expect(DATA_PIPELINE_MANIFEST.tools).toHaveLength(4);
  });

  it('declares the 4 required tool names', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    const toolNames = DATA_PIPELINE_MANIFEST.tools.map((t) => t.name);
    expect(toolNames).toEqual(['etl:extract', 'etl:transform', 'etl:load', 'pipeline:status']);
  });

  it('sets correct permissions for each tool', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    const permissionMap = Object.fromEntries(
      DATA_PIPELINE_MANIFEST.tools.map((t) => [t.name, t.permission]),
    );
    expect(permissionMap['etl:extract']).toBe('read');
    expect(permissionMap['etl:transform']).toBe('write');
    expect(permissionMap['etl:load']).toBe('write');
    expect(permissionMap['pipeline:status']).toBe('read');
  });

  it('all tools point to the pending-runtime-tools stub entry', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    assertAllToolsUseStubEntry(DATA_PIPELINE_MANIFEST);
  });

  it('all tools have required_scopes with correct access level', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    assertToolScopesMatchPermissions(DATA_PIPELINE_MANIFEST);
  });

  it('declares exactly 3 policies', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    expect(DATA_PIPELINE_MANIFEST.policies).toHaveLength(3);
  });

  it('declares data-retention policy', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    const policy = DATA_PIPELINE_MANIFEST.policies.find(
      (p) => p.id === 'data-pipeline.data-retention',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_completion');
    expect(policy!.decision).toBe('deny');
  });

  it('declares schema-validation policy', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    const policy = DATA_PIPELINE_MANIFEST.policies.find(
      (p) => p.id === 'data-pipeline.schema-validation',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_tool_request');
    expect(policy!.decision).toBe('deny');
  });

  it('declares pipeline-approval policy', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    const policy = DATA_PIPELINE_MANIFEST.policies.find(
      (p) => p.id === 'data-pipeline.pipeline-approval',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_claim');
    expect(policy!.decision).toBe('deny');
  });

  it('has correct common manifest shape', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    assertCommonManifestShape(DATA_PIPELINE_MANIFEST, 'data-pipeline');
  });

  it('validates against SoftwareDeliveryManifestSchema', async () => {
    const { DATA_PIPELINE_MANIFEST } = await loadManifest();
    const { SoftwareDeliveryManifestSchema } =
      await import('../software-delivery/manifest-schema.js');
    const parsed = SoftwareDeliveryManifestSchema.parse(DATA_PIPELINE_MANIFEST);
    expect(parsed.id).toBe('data-pipeline');
  });

  it('exports via index', async () => {
    const indexModule = await import('../data-pipeline/index.js');
    expect(indexModule.DATA_PIPELINE_MANIFEST).toBeDefined();
    expect(indexModule.DATA_PIPELINE_MANIFEST.id).toBe('data-pipeline');
  });
});

// ---- security-ops ----------------------------------------------------------

describe('security-ops pack manifest', () => {
  const loadManifest = async () =>
    (await import('../security-ops/manifest.js')) as {
      SECURITY_OPS_MANIFEST: PackManifest;
    };

  it('exports SECURITY_OPS_MANIFEST with correct id and version', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    expect(SECURITY_OPS_MANIFEST.id).toBe('security-ops');
    expect(SECURITY_OPS_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares exactly 4 tools', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    expect(SECURITY_OPS_MANIFEST.tools).toHaveLength(4);
  });

  it('declares the 4 required tool names', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    const toolNames = SECURITY_OPS_MANIFEST.tools.map((t) => t.name);
    expect(toolNames).toEqual([
      'scan:vulnerability',
      'scan:dependency',
      'audit:access',
      'cert:renew',
    ]);
  });

  it('sets correct permissions for each tool', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    const permissionMap = Object.fromEntries(
      SECURITY_OPS_MANIFEST.tools.map((t) => [t.name, t.permission]),
    );
    expect(permissionMap['scan:vulnerability']).toBe('read');
    expect(permissionMap['scan:dependency']).toBe('read');
    expect(permissionMap['audit:access']).toBe('read');
    expect(permissionMap['cert:renew']).toBe('write');
  });

  it('all tools point to the pending-runtime-tools stub entry', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    assertAllToolsUseStubEntry(SECURITY_OPS_MANIFEST);
  });

  it('all tools have required_scopes with correct access level', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    assertToolScopesMatchPermissions(SECURITY_OPS_MANIFEST);
  });

  it('declares exactly 3 policies', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    expect(SECURITY_OPS_MANIFEST.policies).toHaveLength(3);
  });

  it('declares vulnerability-threshold policy', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    const policy = SECURITY_OPS_MANIFEST.policies.find(
      (p) => p.id === 'security-ops.vulnerability-threshold',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_completion');
    expect(policy!.decision).toBe('deny');
  });

  it('declares access-control policy', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    const policy = SECURITY_OPS_MANIFEST.policies.find(
      (p) => p.id === 'security-ops.access-control',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_tool_request');
    expect(policy!.decision).toBe('deny');
  });

  it('declares cert-authority policy', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    const policy = SECURITY_OPS_MANIFEST.policies.find(
      (p) => p.id === 'security-ops.cert-authority',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_claim');
    expect(policy!.decision).toBe('deny');
  });

  it('has correct common manifest shape', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    assertCommonManifestShape(SECURITY_OPS_MANIFEST, 'security-ops');
  });

  it('validates against SoftwareDeliveryManifestSchema', async () => {
    const { SECURITY_OPS_MANIFEST } = await loadManifest();
    const { SoftwareDeliveryManifestSchema } =
      await import('../software-delivery/manifest-schema.js');
    const parsed = SoftwareDeliveryManifestSchema.parse(SECURITY_OPS_MANIFEST);
    expect(parsed.id).toBe('security-ops');
  });

  it('exports via index', async () => {
    const indexModule = await import('../security-ops/index.js');
    expect(indexModule.SECURITY_OPS_MANIFEST).toBeDefined();
    expect(indexModule.SECURITY_OPS_MANIFEST.id).toBe('security-ops');
  });
});

// ---- legal-ops -------------------------------------------------------------

describe('legal-ops pack manifest', () => {
  const loadManifest = async () =>
    (await import('../legal-ops/manifest.js')) as {
      LEGAL_OPS_MANIFEST: PackManifest;
    };

  it('exports LEGAL_OPS_MANIFEST with correct id and version', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    expect(LEGAL_OPS_MANIFEST.id).toBe('legal-ops');
    expect(LEGAL_OPS_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares exactly 3 tools', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    expect(LEGAL_OPS_MANIFEST.tools).toHaveLength(3);
  });

  it('declares the 3 required tool names', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    const toolNames = LEGAL_OPS_MANIFEST.tools.map((t) => t.name);
    expect(toolNames).toEqual(['contract:review', 'compliance:check', 'nda:generate']);
  });

  it('sets correct permissions for each tool', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    const permissionMap = Object.fromEntries(
      LEGAL_OPS_MANIFEST.tools.map((t) => [t.name, t.permission]),
    );
    expect(permissionMap['contract:review']).toBe('read');
    expect(permissionMap['compliance:check']).toBe('read');
    expect(permissionMap['nda:generate']).toBe('write');
  });

  it('all tools point to the pending-runtime-tools stub entry', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    assertAllToolsUseStubEntry(LEGAL_OPS_MANIFEST);
  });

  it('all tools have required_scopes with correct access level', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    assertToolScopesMatchPermissions(LEGAL_OPS_MANIFEST);
  });

  it('declares exactly 3 policies', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    expect(LEGAL_OPS_MANIFEST.policies).toHaveLength(3);
  });

  it('declares confidentiality policy', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    const policy = LEGAL_OPS_MANIFEST.policies.find((p) => p.id === 'legal-ops.confidentiality');
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_completion');
    expect(policy!.decision).toBe('deny');
  });

  it('declares jurisdiction-check policy', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    const policy = LEGAL_OPS_MANIFEST.policies.find((p) => p.id === 'legal-ops.jurisdiction-check');
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_tool_request');
    expect(policy!.decision).toBe('deny');
  });

  it('declares counsel-approval policy', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    const policy = LEGAL_OPS_MANIFEST.policies.find((p) => p.id === 'legal-ops.counsel-approval');
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_claim');
    expect(policy!.decision).toBe('deny');
  });

  it('has correct common manifest shape', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    assertCommonManifestShape(LEGAL_OPS_MANIFEST, 'legal-ops');
  });

  it('validates against SoftwareDeliveryManifestSchema', async () => {
    const { LEGAL_OPS_MANIFEST } = await loadManifest();
    const { SoftwareDeliveryManifestSchema } =
      await import('../software-delivery/manifest-schema.js');
    const parsed = SoftwareDeliveryManifestSchema.parse(LEGAL_OPS_MANIFEST);
    expect(parsed.id).toBe('legal-ops');
  });

  it('exports via index', async () => {
    const indexModule = await import('../legal-ops/index.js');
    expect(indexModule.LEGAL_OPS_MANIFEST).toBeDefined();
    expect(indexModule.LEGAL_OPS_MANIFEST.id).toBe('legal-ops');
  });
});

// ---- compliance-audit ------------------------------------------------------

describe('compliance-audit pack manifest', () => {
  const loadManifest = async () =>
    (await import('../compliance-audit/manifest.js')) as {
      COMPLIANCE_AUDIT_MANIFEST: PackManifest;
    };

  it('exports COMPLIANCE_AUDIT_MANIFEST with correct id and version', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    expect(COMPLIANCE_AUDIT_MANIFEST.id).toBe('compliance-audit');
    expect(COMPLIANCE_AUDIT_MANIFEST.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares exactly 3 tools', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    expect(COMPLIANCE_AUDIT_MANIFEST.tools).toHaveLength(3);
  });

  it('declares the 3 required tool names', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    const toolNames = COMPLIANCE_AUDIT_MANIFEST.tools.map((t) => t.name);
    expect(toolNames).toEqual(['audit:run', 'audit:report', 'control:verify']);
  });

  it('sets correct permissions for each tool', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    const permissionMap = Object.fromEntries(
      COMPLIANCE_AUDIT_MANIFEST.tools.map((t) => [t.name, t.permission]),
    );
    expect(permissionMap['audit:run']).toBe('write');
    expect(permissionMap['audit:report']).toBe('read');
    expect(permissionMap['control:verify']).toBe('read');
  });

  it('all tools point to the pending-runtime-tools stub entry', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    assertAllToolsUseStubEntry(COMPLIANCE_AUDIT_MANIFEST);
  });

  it('all tools have required_scopes with correct access level', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    assertToolScopesMatchPermissions(COMPLIANCE_AUDIT_MANIFEST);
  });

  it('declares exactly 3 policies', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    expect(COMPLIANCE_AUDIT_MANIFEST.policies).toHaveLength(3);
  });

  it('declares regulatory-framework policy', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    const policy = COMPLIANCE_AUDIT_MANIFEST.policies.find(
      (p) => p.id === 'compliance-audit.regulatory-framework',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_completion');
    expect(policy!.decision).toBe('deny');
  });

  it('declares evidence-retention policy', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    const policy = COMPLIANCE_AUDIT_MANIFEST.policies.find(
      (p) => p.id === 'compliance-audit.evidence-retention',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_tool_request');
    expect(policy!.decision).toBe('deny');
  });

  it('declares audit-sign-off policy', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    const policy = COMPLIANCE_AUDIT_MANIFEST.policies.find(
      (p) => p.id === 'compliance-audit.audit-sign-off',
    );
    expect(policy).toBeDefined();
    expect(policy!.trigger).toBe('on_claim');
    expect(policy!.decision).toBe('deny');
  });

  it('has correct common manifest shape', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    assertCommonManifestShape(COMPLIANCE_AUDIT_MANIFEST, 'compliance-audit');
  });

  it('validates against SoftwareDeliveryManifestSchema', async () => {
    const { COMPLIANCE_AUDIT_MANIFEST } = await loadManifest();
    const { SoftwareDeliveryManifestSchema } =
      await import('../software-delivery/manifest-schema.js');
    const parsed = SoftwareDeliveryManifestSchema.parse(COMPLIANCE_AUDIT_MANIFEST);
    expect(parsed.id).toBe('compliance-audit');
  });

  it('exports via index', async () => {
    const indexModule = await import('../compliance-audit/index.js');
    expect(indexModule.COMPLIANCE_AUDIT_MANIFEST).toBeDefined();
    expect(indexModule.COMPLIANCE_AUDIT_MANIFEST.id).toBe('compliance-audit');
  });
});
