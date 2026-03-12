// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

import type { PackPolicyFactory, PolicyRule } from '@lumenflow/kernel';

export const createAgentRuntimePolicyFactory: PackPolicyFactory = async () => {
  const rules: PolicyRule[] = [];
  return rules;
};
