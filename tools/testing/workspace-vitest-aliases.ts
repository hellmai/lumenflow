import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const UTF8_ENCODING = 'utf-8';
const PACKAGE_JSON_FILE = 'package.json';
const WORKSPACE_SCOPE_DIRECTORY = path.join('packages', '@lumenflow');
const EXPORT_ROOT_SUBPATH = '.';
const EXPORT_SUBPATH_PREFIX = './';
const DIST_SOURCE_PREFIX = './dist/';
const SOURCE_PATH_PREFIX = './src/';
const DIST_FILE_EXTENSION = '.js';
const SOURCE_FILE_EXTENSION = '.ts';
const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g;
const REGEX_ESCAPE_REPLACEMENT = '\\$&';
const LUMENFLOW_SCOPE = '@lumenflow';
const PATH_SEPARATOR = '/';
const EMPTY_EXPORT_NAME = '';
const WILDCARD_TOKEN = '*';

type WorkspaceAlias = { find: RegExp; replacement: string };

type PackageExportObject = {
  import?: string;
  default?: string;
  node?: string;
};

type PackageExportValue = string | PackageExportObject;

type PackageJsonWithExports = {
  name?: string;
  exports?: Record<string, PackageExportValue>;
};

type BuildWorkspaceVitestAliasesOptions = {
  repoRoot: string;
};

function escapeRegex(value: string): string {
  return value.replace(REGEX_ESCAPE_PATTERN, REGEX_ESCAPE_REPLACEMENT);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, UTF8_ENCODING)) as T;
}

function extractExportPath(value: PackageExportValue | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value.import === 'string') {
    return value.import;
  }

  if (typeof value.default === 'string') {
    return value.default;
  }

  if (typeof value.node === 'string') {
    return value.node;
  }

  return undefined;
}

function isResolvableDistJsPath(exportPath: string): boolean {
  return exportPath.startsWith(DIST_SOURCE_PREFIX) && exportPath.endsWith(DIST_FILE_EXTENSION);
}

function toSourcePath(packageDir: string, distPath: string): string {
  const sourceRelativePath = distPath
    .replace(DIST_SOURCE_PREFIX, SOURCE_PATH_PREFIX)
    .replace(new RegExp(`${escapeRegex(DIST_FILE_EXTENSION)}$`), SOURCE_FILE_EXTENSION);
  return path.resolve(packageDir, sourceRelativePath);
}

function createSpecifierRegex(packageName: string, exportName: string): RegExp {
  if (exportName === EMPTY_EXPORT_NAME) {
    return new RegExp(`^${escapeRegex(packageName)}$`);
  }

  return new RegExp(`^${escapeRegex(packageName)}${PATH_SEPARATOR}${escapeRegex(exportName)}$`);
}

function createAlias(
  packageName: string,
  subpath: string,
  sourcePath: string,
): WorkspaceAlias | undefined {
  if (!subpath.startsWith(EXPORT_SUBPATH_PREFIX) && subpath !== EXPORT_ROOT_SUBPATH) {
    return undefined;
  }

  const exportName =
    subpath === EXPORT_ROOT_SUBPATH
      ? EMPTY_EXPORT_NAME
      : subpath.slice(EXPORT_SUBPATH_PREFIX.length);
  if (exportName.includes(WILDCARD_TOKEN)) {
    return undefined;
  }

  return {
    find: createSpecifierRegex(packageName, exportName),
    replacement: sourcePath,
  };
}

function resolvePackageName(
  packageJson: PackageJsonWithExports,
  packageDirectoryName: string,
): string {
  if (typeof packageJson.name === 'string' && packageJson.name.length > 0) {
    return packageJson.name;
  }

  return `${LUMENFLOW_SCOPE}${PATH_SEPARATOR}${packageDirectoryName}`;
}

export function buildWorkspaceVitestAliases(
  options: BuildWorkspaceVitestAliasesOptions,
): Array<WorkspaceAlias> {
  const workspaceRoot = path.resolve(options.repoRoot, WORKSPACE_SCOPE_DIRECTORY);
  const packageDirectories = readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const aliases: Array<WorkspaceAlias> = [];

  for (const packageDirectoryName of packageDirectories) {
    const packageDir = path.join(workspaceRoot, packageDirectoryName);
    const packageJsonPath = path.join(packageDir, PACKAGE_JSON_FILE);
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = readJsonFile<PackageJsonWithExports>(packageJsonPath);
    const packageName = resolvePackageName(packageJson, packageDirectoryName);
    const exportEntries = Object.entries(packageJson.exports ?? {});

    for (const [subpath, exportValue] of exportEntries) {
      const exportPath = extractExportPath(exportValue);
      if (!exportPath || !isResolvableDistJsPath(exportPath)) {
        continue;
      }

      const sourcePath = toSourcePath(packageDir, exportPath);
      if (!existsSync(sourcePath)) {
        continue;
      }

      const alias = createAlias(packageName, subpath, sourcePath);
      if (!alias) {
        continue;
      }

      aliases.push(alias);
    }
  }

  return aliases;
}

export function resolveAliasMatch(
  aliases: Array<WorkspaceAlias>,
  specifier: string,
): string | undefined {
  for (const alias of aliases) {
    if (alias.find.test(specifier)) {
      return alias.replacement;
    }
  }

  return undefined;
}
