// Copyright (c) 2026 Hellmai Ltd
// SPDX-License-Identifier: AGPL-3.0-only

interface PendingRuntimeMigrationOutput {
  success: false;
  error: {
    code: 'TOOL_NOT_IMPLEMENTED';
    message: string;
  };
}

export async function pendingRuntimeMigrationTool(): Promise<PendingRuntimeMigrationOutput> {
  return {
    success: false,
    error: {
      code: 'TOOL_NOT_IMPLEMENTED',
      message:
        'Tool is declared in the software-delivery manifest but has not been migrated to a runtime handler yet.',
    },
  };
}
