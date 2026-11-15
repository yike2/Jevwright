import { glob, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

type ExpandPathsSuccess = {
  ok: true;
  files: string[];
};

type ExpandPathsFailure = {
  ok: false;
  error: string;
};

export type ExpandPathsResult = ExpandPathsSuccess | ExpandPathsFailure;

function isInsideWorkingDirectory(filePath: string, cwd: string): boolean {
  const relativePath = relative(cwd, filePath);
  return !(relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath));
}

function normalizeRelative(filePath: string, cwd: string): string {
  return relative(cwd, filePath).split("\\").join("/");
}

// A directory search never enters these: dependencies, Git's data, and hidden directories such as .github.
function isSkippedDirectory(name: string): boolean {
  return name === "node_modules" || name.startsWith(".");
}

async function collectDirectoryFiles(
  dirPath: string,
  cwd: string,
  arg: string,
): Promise<{ ok: true; files: string[] } | { ok: false; error: string }> {
  const files: string[] = [];
  const pending = [dirPath];

  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!isSkippedDirectory(entry.name)) pending.push(resolve(dir, entry.name));
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith(".yaml")) {
        continue;
      }

      const candidate = resolve(dir, entry.name);
      if (!isInsideWorkingDirectory(candidate, cwd)) {
        return { ok: false, error: `File is outside the working directory: ${arg}` };
      }

      files.push(normalizeRelative(candidate, cwd));
    }
  }

  return { ok: true, files };
}

async function collectGlobFiles(
  arg: string,
  cwd: string,
): Promise<{ ok: true; files: string[] } | { ok: false; error: string }> {
  const files: string[] = [];

  for await (const entry of glob(arg, { cwd, withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const candidate = resolve(entry.parentPath, entry.name);
    if (!isInsideWorkingDirectory(candidate, cwd)) {
      return { ok: false, error: `File is outside the working directory: ${arg}` };
    }

    files.push(normalizeRelative(candidate, cwd));
  }

  return { ok: true, files };
}

export async function expandPaths(args: readonly string[], cwd: string): Promise<ExpandPathsResult> {
  const files = new Set<string>();

  for (const arg of args) {
    const path = resolve(cwd, arg);

    if (arg.includes("*") || arg.includes("?") || arg.includes("[")) {
      const matches = await collectGlobFiles(arg, cwd);
      if (!matches.ok) {
        return matches;
      }

      if (matches.files.length === 0) {
        return { ok: false, error: `No files match ${arg}` };
      }

      for (const file of matches.files) {
        files.add(file);
      }
      continue;
    }

    let info;
    try {
      info = await stat(path);
    } catch {
      return { ok: false, error: `File not found: ${arg}` };
    }

    if (info.isFile()) {
      if (!isInsideWorkingDirectory(path, cwd)) {
        return { ok: false, error: `File is outside the working directory: ${arg}` };
      }

      files.add(normalizeRelative(path, cwd));
      continue;
    }

    if (info.isDirectory()) {
      const directoryFiles = await collectDirectoryFiles(path, cwd, arg);
      if (!directoryFiles.ok) {
        return directoryFiles;
      }

      if (directoryFiles.files.length === 0) {
        return { ok: false, error: `No .yaml files found in ${arg}` };
      }

      for (const file of directoryFiles.files) {
        files.add(file);
      }
      continue;
    }

    return { ok: false, error: `File not found: ${arg}` };
  }

  return { ok: true, files: [...files].sort() };
}
