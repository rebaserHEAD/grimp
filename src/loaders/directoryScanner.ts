// ---------------------------------------------------------------------------
// directoryScanner.ts – utilities for scanning / validating an SS14 repo dir
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface RepositorySummary {
  tileFiles: number;
  entityFiles: number;
  decalFiles: number;
  catalogFiles: number;
  forkDirs: string[];
  totalFiles: number;
}

// ---- helpers --------------------------------------------------------------

/**
 * Given a webkitRelativePath like "repo/Resources/Prototypes/Tiles/floors.yml",
 * return the portion after "Resources/" → "Prototypes/Tiles/floors.yml".
 *
 * If the user picked the Resources/ folder directly the path looks like
 * "Resources/Prototypes/Tiles/floors.yml" – the root segment IS "Resources".
 *
 * Returns undefined when the file is not under Resources/.
 */
function stripToResources(webkitPath: string): string | undefined {
  const idx = webkitPath.indexOf('Resources/');
  if (idx === -1) return undefined;

  // Everything after the first "Resources/" occurrence
  const after = webkitPath.slice(idx + 'Resources/'.length);

  // If `after` is empty the entry is the Resources folder itself – skip it.
  return after.length > 0 ? after : undefined;
}

// ---- public API -----------------------------------------------------------

/**
 * Build a `Map<relativePath, File>` from a `<input webkitdirectory>` FileList.
 * Paths are relative to `Resources/` (e.g. `Prototypes/Tiles/floors.yml`).
 *
 * Async with periodic yields so the UI can update progress.
 */
export async function buildFileMapFromFileList(
  files: File[],
  onProgress?: (processed: number, total: number) => void,
): Promise<Map<string, File>> {
  const map = new Map<string, File>();
  const total = files.length;
  const YIELD_INTERVAL = 500; // yield to UI every N files

  for (let i = 0; i < total; i++) {
    const rel = stripToResources(files[i].webkitRelativePath);
    // Only index Prototypes/ and Textures/ (same scope as showDirectoryPicker path)
    if (rel !== undefined && (rel.startsWith('Prototypes/') || rel.startsWith('Textures/'))) {
      map.set(rel, files[i]);
    }
    if (i > 0 && i % YIELD_INTERVAL === 0) {
      onProgress?.(i, total);
      // Yield to let React render progress updates
      await new Promise(r => setTimeout(r, 0));
    }
  }
  onProgress?.(total, total);
  return map;
}

/**
 * Build a file map from a `FileSystemDirectoryHandle` (showDirectoryPicker).
 * Only walks `Prototypes/` and `Textures/` for performance.
 */
export async function buildFileMapFromDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void,
): Promise<Map<string, File>> {
  const map = new Map<string, File>();
  let count = 0;

  // Locate the Resources/ directory – it might be the root itself.
  let resourcesHandle: FileSystemDirectoryHandle;
  try {
    resourcesHandle = await rootHandle.getDirectoryHandle('Resources');
  } catch {
    // Assume the root IS Resources/
    resourcesHandle = rootHandle;
  }

  const targetDirs = ['Prototypes', 'Textures'];

  for (const dirName of targetDirs) {
    let dirHandle: FileSystemDirectoryHandle;
    try {
      dirHandle = await resourcesHandle.getDirectoryHandle(dirName);
    } catch {
      continue; // directory doesn't exist – skip
    }

    await walkDirectory(dirHandle, dirName, map, () => {
      count++;
      if (onProgress && count % 100 === 0) {
        onProgress(count);
      }
    });
  }

  return map;
}

async function walkDirectory(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  map: Map<string, File>,
  onFile: () => void,
): Promise<void> {
  for await (const entry of (handle as any).values()) {
    const entryPath = `${prefix}/${entry.name}`;
    if (entry.kind === 'file') {
      const file: File = await entry.getFile();
      map.set(entryPath, file);
      onFile();
    } else if (entry.kind === 'directory') {
      await walkDirectory(entry as FileSystemDirectoryHandle, entryPath, map, onFile);
    }
  }
}

/**
 * Check that a file map looks like a valid SS14 repository.
 */
export function validateRepository(files: Map<string, File>): ValidationResult {
  if (files.size === 0) {
    return { valid: false, error: 'No files found' };
  }

  let hasPrototypes = false;
  for (const key of files.keys()) {
    if (key.startsWith('Prototypes/')) {
      hasPrototypes = true;
      break;
    }
  }

  if (!hasPrototypes) {
    return { valid: false, error: 'No Prototypes/ directory found' };
  }

  return { valid: true };
}

/**
 * Produce a quick summary of what's inside a scanned repository.
 */
export function summarizeRepository(files: Map<string, File>): RepositorySummary {
  let tileFiles = 0;
  let entityFiles = 0;
  let decalFiles = 0;
  let catalogFiles = 0;
  const forkDirSet = new Set<string>();

  for (const key of files.keys()) {
    if (!key.startsWith('Prototypes/') || !key.endsWith('.yml')) continue;

    // Path segments after "Prototypes/"
    const rest = key.slice('Prototypes/'.length);
    const segments = rest.split('/');

    // Detect fork directories (leading underscore convention, e.g. _MyFork)
    if (segments.length > 1 && segments[0].startsWith('_')) {
      forkDirSet.add(segments[0]);
    }

    // Categorise by the first non-fork segment
    const categorySegment = segments[0].startsWith('_') && segments.length > 1
      ? segments[1]
      : segments[0];

    switch (categorySegment) {
      case 'Tiles':
        tileFiles++;
        break;
      case 'Entities':
        entityFiles++;
        break;
      case 'Decals':
        decalFiles++;
        break;
      case 'Catalog':
        catalogFiles++;
        break;
    }
  }

  return {
    tileFiles,
    entityFiles,
    decalFiles,
    catalogFiles,
    forkDirs: [...forkDirSet].sort(),
    totalFiles: files.size,
  };
}
