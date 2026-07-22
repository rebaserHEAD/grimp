import type { ResourceProvider } from './resourceProvider';

// Resources are served from disk by the Electron main process under the /@fork
// prefix on the app's own origin (see electron/main.cjs). Same-origin, so
// sprite thumbnails can be drawn to a canvas without tainting it. Keys are
// relative to the fork's Resources/ directory, matching the browser provider.
const FORK_PREFIX = '/@fork/';

function toUrl(key: string): string {
  // Encode each path segment but keep the separators.
  return FORK_PREFIX + key.split('/').map(encodeURIComponent).join('/');
}

/**
 * ResourceProvider backed by a native fork directory on disk, read lazily
 * through the forkres:// protocol. Unlike FileSystemResourceProvider it never
 * holds file contents in memory: it keeps only the list of relative paths and
 * fetches each file on demand.
 */
export class ElectronResourceProvider implements ResourceProvider {
  readonly isLocal = true;
  readonly forkName: string;
  private keys: string[];

  constructor(keys: string[], forkName: string) {
    this.keys = keys;
    this.forkName = forkName;
  }

  async listFiles(dir: string, ext: string): Promise<string[]> {
    const results: string[] = [];
    for (const key of this.keys) {
      if (key.startsWith(dir) && key.endsWith(ext)) results.push(`/${key}`);
    }
    return results;
  }

  async readText(path: string): Promise<string> {
    const key = path.startsWith('/') ? path.slice(1) : path;
    const res = await fetch(toUrl(key));
    if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
    return res.text();
  }

  getImageUrl(path: string): string {
    const key = path.startsWith('/') ? path.slice(1) : path;
    return toUrl(key);
  }

  dispose(): void {
    this.keys = [];
  }
}
