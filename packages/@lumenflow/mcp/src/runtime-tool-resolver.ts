import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  TOOL_HANDLER_KINDS,
  defaultRuntimeToolCapabilityResolver,
  type ExecutionContext,
  type InProcessToolFn,
  type RuntimeToolCapabilityResolver,
  type ToolOutput,
} from '@lumenflow/kernel';
import { z } from 'zod';

const DEFAULT_IN_PROCESS_INPUT_SCHEMA = z.record(z.string(), z.unknown());
const DEFAULT_IN_PROCESS_OUTPUT_SCHEMA = z.record(z.string(), z.unknown());

const RUNTIME_TOOL_NOT_MIGRATED_CODE = 'RUNTIME_TOOL_NOT_MIGRATED';
const RUNTIME_TOOL_NOT_MIGRATED_MESSAGE =
  'Tool is registered for runtime migration but in-process implementation has not landed yet.';
const RUNTIME_PROJECT_ROOT_METADATA_KEY = 'project_root';
const UTF8_ENCODING = 'utf-8';
const DEFAULT_FILE_READ_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const IN_PROCESS_TOOL_NAMES = {
  WU_STATUS: 'wu:status',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_EDIT: 'file:edit',
  FILE_DELETE: 'file:delete',
} as const;

const IN_PROCESS_TOOL_DESCRIPTIONS = {
  WU_STATUS: 'In-process runtime placeholder for wu:status',
  FILE_READ: 'Read file content directly via runtime in-process handler',
  FILE_WRITE: 'Write file content directly via runtime in-process handler',
  FILE_EDIT: 'Edit file content directly via runtime in-process handler',
  FILE_DELETE: 'Delete file content directly via runtime in-process handler',
} as const;

const FILE_TOOL_ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  FILE_READ_FAILED: 'FILE_READ_FAILED',
  FILE_READ_TOO_LARGE: 'FILE_READ_TOO_LARGE',
  FILE_WRITE_FAILED: 'FILE_WRITE_FAILED',
  FILE_EDIT_FAILED: 'FILE_EDIT_FAILED',
  FILE_EDIT_TARGET_NOT_FOUND: 'FILE_EDIT_TARGET_NOT_FOUND',
  FILE_EDIT_NOT_UNIQUE: 'FILE_EDIT_NOT_UNIQUE',
  FILE_DELETE_FAILED: 'FILE_DELETE_FAILED',
} as const;

const FILE_TOOL_MESSAGES = {
  FILE_WRITTEN: 'File written',
  FILE_EDITED: 'File edited',
  DELETE_COMPLETE: 'Delete complete',
  PATH_NOT_FOUND: 'Path not found',
  PARENT_DIRECTORY_MISSING: 'Parent directory does not exist',
  DIRECTORY_NOT_EMPTY:
    'Directory is not empty. Use recursive=true to delete non-empty directories.',
} as const;

const FILE_READ_INPUT_SCHEMA = z.object({
  path: z.string().min(1),
  encoding: z.string().optional(),
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
  max_size: z.number().int().positive().optional(),
});

const FILE_WRITE_INPUT_SCHEMA = z.object({
  path: z.string().min(1),
  content: z.string(),
  encoding: z.string().optional(),
  no_create_dirs: z.boolean().optional(),
});

const FILE_EDIT_INPUT_SCHEMA = z.object({
  path: z.string().min(1),
  old_string: z.string(),
  new_string: z.string(),
  encoding: z.string().optional(),
  replace_all: z.boolean().optional(),
});

const FILE_DELETE_INPUT_SCHEMA = z.object({
  path: z.string().min(1),
  recursive: z.boolean().optional(),
  force: z.boolean().optional(),
});

const FILE_READ_OUTPUT_SCHEMA = z.object({
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const FILE_WRITE_OUTPUT_SCHEMA = z.object({
  message: z.string(),
  path: z.string(),
  bytes_written: z.number().int().nonnegative(),
});

const FILE_EDIT_OUTPUT_SCHEMA = z.object({
  message: z.string(),
  path: z.string(),
  replacements: z.number().int().positive(),
});

const FILE_DELETE_OUTPUT_SCHEMA = z.object({
  message: z.string(),
  metadata: z
    .object({
      deleted_count: z.number().int().nonnegative(),
      was_directory: z.boolean(),
    })
    .optional(),
});

interface RegisteredInProcessToolHandler {
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  fn: InProcessToolFn;
}

function createFailureOutput(code: string, message: string): ToolOutput {
  return {
    success: false,
    error: {
      code,
      message,
    },
  };
}

function createSuccessOutput(data: unknown): ToolOutput {
  return {
    success: true,
    data,
  };
}

function resolveWorkspaceRoot(context: ExecutionContext): string {
  const root = context.metadata?.[RUNTIME_PROJECT_ROOT_METADATA_KEY];
  if (typeof root === 'string' && root.trim().length > 0) {
    return path.resolve(root);
  }
  return process.cwd();
}

function resolveTargetPath(context: ExecutionContext, inputPath: string): string {
  return path.resolve(resolveWorkspaceRoot(context), inputPath);
}

function resolveEncoding(encoding?: string): BufferEncoding {
  return (encoding ?? UTF8_ENCODING) as BufferEncoding;
}

function extractLineRange(content: string, startLine?: number, endLine?: number): string {
  if (startLine === undefined && endLine === undefined) {
    return content;
  }

  const lines = content.split('\n');
  const start = (startLine ?? 1) - 1;
  const end = endLine ?? lines.length;
  return lines.slice(start, end).join('\n');
}

function countOccurrences(content: string, searchText: string): number {
  if (!searchText) {
    return 0;
  }

  let count = 0;
  let cursor = 0;
  while (cursor < content.length) {
    const index = content.indexOf(searchText, cursor);
    if (index === -1) {
      break;
    }
    count += 1;
    cursor = index + searchText.length;
  }
  return count;
}

async function getPathInfo(targetPath: string): Promise<{ exists: boolean; isDirectory: boolean }> {
  try {
    const targetStats = await stat(targetPath);
    return { exists: true, isDirectory: targetStats.isDirectory() };
  } catch {
    return { exists: false, isDirectory: false };
  }
}

async function countItemsInDirectory(directoryPath: string): Promise<number> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    count += 1;
    if (entry.isDirectory()) {
      count += await countItemsInDirectory(path.join(directoryPath, entry.name));
    }
  }

  return count;
}

const fileReadInProcess: InProcessToolFn = async (rawInput, context) => {
  const parsedInput = FILE_READ_INPUT_SCHEMA.safeParse(rawInput);
  if (!parsedInput.success) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.INVALID_INPUT, parsedInput.error.message);
  }

  const targetPath = resolveTargetPath(context, parsedInput.data.path);
  const encoding = resolveEncoding(parsedInput.data.encoding);
  const maxSize = parsedInput.data.max_size ?? DEFAULT_FILE_READ_MAX_SIZE_BYTES;

  try {
    const targetStats = await stat(targetPath);
    if (targetStats.size > maxSize) {
      return createFailureOutput(
        FILE_TOOL_ERROR_CODES.FILE_READ_TOO_LARGE,
        `File size (${targetStats.size} bytes) exceeds maximum allowed (${maxSize} bytes).`,
      );
    }

    const content = await readFile(targetPath, { encoding });
    const selectedContent = extractLineRange(
      content,
      parsedInput.data.start_line,
      parsedInput.data.end_line,
    );
    const totalLineCount = content.length === 0 ? 0 : content.split('\n').length;

    return createSuccessOutput({
      content: selectedContent,
      metadata: {
        size_bytes: targetStats.size,
        line_count: totalLineCount,
        lines_returned: selectedContent.length === 0 ? 0 : selectedContent.split('\n').length,
      },
    });
  } catch (cause) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.FILE_READ_FAILED, (cause as Error).message);
  }
};

const fileWriteInProcess: InProcessToolFn = async (rawInput, context) => {
  const parsedInput = FILE_WRITE_INPUT_SCHEMA.safeParse(rawInput);
  if (!parsedInput.success) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.INVALID_INPUT, parsedInput.error.message);
  }

  const targetPath = resolveTargetPath(context, parsedInput.data.path);
  const encoding = resolveEncoding(parsedInput.data.encoding);
  const createDirectories = !parsedInput.data.no_create_dirs;
  const parentDirectory = path.dirname(targetPath);

  try {
    if (createDirectories) {
      await mkdir(parentDirectory, { recursive: true });
    } else {
      const parentInfo = await getPathInfo(parentDirectory);
      if (!parentInfo.exists || !parentInfo.isDirectory) {
        return createFailureOutput(
          FILE_TOOL_ERROR_CODES.FILE_WRITE_FAILED,
          `${FILE_TOOL_MESSAGES.PARENT_DIRECTORY_MISSING}: ${parentDirectory}`,
        );
      }
    }

    await writeFile(targetPath, parsedInput.data.content, { encoding });

    return createSuccessOutput({
      message: FILE_TOOL_MESSAGES.FILE_WRITTEN,
      path: targetPath,
      bytes_written: Buffer.byteLength(parsedInput.data.content, encoding),
    });
  } catch (cause) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.FILE_WRITE_FAILED, (cause as Error).message);
  }
};

const fileEditInProcess: InProcessToolFn = async (rawInput, context) => {
  const parsedInput = FILE_EDIT_INPUT_SCHEMA.safeParse(rawInput);
  if (!parsedInput.success) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.INVALID_INPUT, parsedInput.error.message);
  }

  const targetPath = resolveTargetPath(context, parsedInput.data.path);
  const encoding = resolveEncoding(parsedInput.data.encoding);
  const replaceAll = parsedInput.data.replace_all ?? false;

  try {
    const content = await readFile(targetPath, { encoding });
    const occurrenceCount = countOccurrences(content, parsedInput.data.old_string);

    if (occurrenceCount === 0) {
      return createFailureOutput(
        FILE_TOOL_ERROR_CODES.FILE_EDIT_TARGET_NOT_FOUND,
        `old_string not found in file: ${parsedInput.data.old_string}`,
      );
    }

    if (occurrenceCount > 1 && !replaceAll) {
      return createFailureOutput(
        FILE_TOOL_ERROR_CODES.FILE_EDIT_NOT_UNIQUE,
        `old_string is not unique in file (found ${occurrenceCount} occurrences).`,
      );
    }

    const nextContent = replaceAll
      ? content.split(parsedInput.data.old_string).join(parsedInput.data.new_string)
      : content.replace(parsedInput.data.old_string, parsedInput.data.new_string);

    await writeFile(targetPath, nextContent, { encoding });

    return createSuccessOutput({
      message: FILE_TOOL_MESSAGES.FILE_EDITED,
      path: targetPath,
      replacements: replaceAll ? occurrenceCount : 1,
    });
  } catch (cause) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.FILE_EDIT_FAILED, (cause as Error).message);
  }
};

const fileDeleteInProcess: InProcessToolFn = async (rawInput, context) => {
  const parsedInput = FILE_DELETE_INPUT_SCHEMA.safeParse(rawInput);
  if (!parsedInput.success) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.INVALID_INPUT, parsedInput.error.message);
  }

  const targetPath = resolveTargetPath(context, parsedInput.data.path);
  const recursive = parsedInput.data.recursive ?? false;
  const force = parsedInput.data.force ?? false;

  try {
    const targetInfo = await getPathInfo(targetPath);
    if (!targetInfo.exists) {
      if (force) {
        return createSuccessOutput({
          message: FILE_TOOL_MESSAGES.DELETE_COMPLETE,
          metadata: {
            deleted_count: 0,
            was_directory: false,
          },
        });
      }
      return createFailureOutput(
        FILE_TOOL_ERROR_CODES.FILE_DELETE_FAILED,
        `${FILE_TOOL_MESSAGES.PATH_NOT_FOUND}: ${targetPath}`,
      );
    }

    if (targetInfo.isDirectory && !recursive) {
      const entries = await readdir(targetPath);
      if (entries.length > 0) {
        return createFailureOutput(
          FILE_TOOL_ERROR_CODES.FILE_DELETE_FAILED,
          FILE_TOOL_MESSAGES.DIRECTORY_NOT_EMPTY,
        );
      }
    }

    let deletedCount = 1;
    if (targetInfo.isDirectory && recursive) {
      deletedCount += await countItemsInDirectory(targetPath);
    }

    await rm(targetPath, { recursive, force });

    return createSuccessOutput({
      message: FILE_TOOL_MESSAGES.DELETE_COMPLETE,
      metadata: {
        deleted_count: deletedCount,
        was_directory: targetInfo.isDirectory,
      },
    });
  } catch (cause) {
    return createFailureOutput(FILE_TOOL_ERROR_CODES.FILE_DELETE_FAILED, (cause as Error).message);
  }
};

const registeredInProcessToolHandlers = new Map<string, RegisteredInProcessToolHandler>([
  [
    IN_PROCESS_TOOL_NAMES.WU_STATUS,
    {
      description: IN_PROCESS_TOOL_DESCRIPTIONS.WU_STATUS,
      inputSchema: DEFAULT_IN_PROCESS_INPUT_SCHEMA,
      outputSchema: DEFAULT_IN_PROCESS_OUTPUT_SCHEMA,
      fn: async () => ({
        success: false,
        error: {
          code: RUNTIME_TOOL_NOT_MIGRATED_CODE,
          message: RUNTIME_TOOL_NOT_MIGRATED_MESSAGE,
        },
      }),
    },
  ],
  [
    IN_PROCESS_TOOL_NAMES.FILE_READ,
    {
      description: IN_PROCESS_TOOL_DESCRIPTIONS.FILE_READ,
      inputSchema: FILE_READ_INPUT_SCHEMA,
      outputSchema: FILE_READ_OUTPUT_SCHEMA,
      fn: fileReadInProcess,
    },
  ],
  [
    IN_PROCESS_TOOL_NAMES.FILE_WRITE,
    {
      description: IN_PROCESS_TOOL_DESCRIPTIONS.FILE_WRITE,
      inputSchema: FILE_WRITE_INPUT_SCHEMA,
      outputSchema: FILE_WRITE_OUTPUT_SCHEMA,
      fn: fileWriteInProcess,
    },
  ],
  [
    IN_PROCESS_TOOL_NAMES.FILE_EDIT,
    {
      description: IN_PROCESS_TOOL_DESCRIPTIONS.FILE_EDIT,
      inputSchema: FILE_EDIT_INPUT_SCHEMA,
      outputSchema: FILE_EDIT_OUTPUT_SCHEMA,
      fn: fileEditInProcess,
    },
  ],
  [
    IN_PROCESS_TOOL_NAMES.FILE_DELETE,
    {
      description: IN_PROCESS_TOOL_DESCRIPTIONS.FILE_DELETE,
      inputSchema: FILE_DELETE_INPUT_SCHEMA,
      outputSchema: FILE_DELETE_OUTPUT_SCHEMA,
      fn: fileDeleteInProcess,
    },
  ],
]);

export function isInProcessPackToolRegistered(toolName: string): boolean {
  return registeredInProcessToolHandlers.has(toolName);
}

export function listInProcessPackTools(): string[] {
  return [...registeredInProcessToolHandlers.keys()].sort();
}

export const packToolCapabilityResolver: RuntimeToolCapabilityResolver = async (input) => {
  const registeredHandler = registeredInProcessToolHandlers.get(input.tool.name);
  if (!registeredHandler) {
    return defaultRuntimeToolCapabilityResolver(input);
  }

  return {
    name: input.tool.name,
    domain: input.loadedPack.manifest.id,
    version: input.loadedPack.manifest.version,
    input_schema: registeredHandler.inputSchema,
    output_schema: registeredHandler.outputSchema,
    permission: input.tool.permission,
    required_scopes: input.tool.required_scopes,
    handler: {
      kind: TOOL_HANDLER_KINDS.IN_PROCESS,
      fn: registeredHandler.fn,
    },
    description: registeredHandler.description,
    pack: input.loadedPack.pin.id,
  };
};
