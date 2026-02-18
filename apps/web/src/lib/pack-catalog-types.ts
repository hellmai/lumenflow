/**
 * Types for the pack catalog page.
 *
 * These types represent pack manifest data decoupled from the kernel module
 * so they can be used in client components without server-side dependencies.
 */

/** Scope entry for a tool's required permissions. */
export interface PackToolScopeView {
  readonly type: string;
  readonly pattern?: string;
  readonly access?: string;
}

/** A tool registered by a domain pack. */
export interface PackToolView {
  readonly name: string;
  readonly permission: 'read' | 'write' | 'admin';
  readonly scopes: readonly PackToolScopeView[];
}

/** A policy defined by a domain pack. */
export interface PackPolicyView {
  readonly id: string;
  readonly trigger: string;
  readonly decision: 'allow' | 'deny';
  readonly reason?: string;
}

/** A loaded domain pack with manifest metadata. */
export interface PackCatalogEntry {
  readonly id: string;
  readonly version: string;
  readonly source: 'local' | 'git' | 'registry';
  readonly integrity: string;
  readonly tools: readonly PackToolView[];
  readonly policies: readonly PackPolicyView[];
  readonly taskTypes: readonly string[];
  readonly evidenceTypes: readonly string[];
}
