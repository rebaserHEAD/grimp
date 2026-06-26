/**
 * Abstraction for reading SS14 resource files.
 * Allows the editor to load from HTTP (built-in) or local filesystem.
 *
 * Path conventions:
 * - `listFiles(dir)`: directory prefix without leading slash, e.g. `'Prototypes/Tiles'`
 * - `readText(path)`: file path with leading slash, e.g. `'/Prototypes/Tiles/floors.yml'`
 * - `getImageUrl(path)`: file path with or without leading slash, e.g. `'Textures/Structures/apc.rsi/base.png'`
 */
export interface ResourceProvider {
  /** List all files in a directory matching an extension. Returns paths like `'/Prototypes/Tiles/floors.yml'`. */
  listFiles(dir: string, ext: string): Promise<string[]>;
  /** Read a file as text (YAML, JSON). Path must start with `/`. */
  readText(path: string): Promise<string>;
  /** Get a URL usable as `img.src`. Accepts paths with or without leading `/`. */
  getImageUrl(path: string): string;
  /** Human-readable fork name (e.g. the picked folder name, or 'Built-in'). */
  readonly forkName: string;
  /** Whether resources come from a local directory (vs built-in HTTP). */
  readonly isLocal: boolean;
  /** Release resources (revoke blob URLs, etc.). */
  dispose(): void;
}

function manifestName(dir: string): string | null {
  if (dir.includes('Tiles')) return 'tiles';
  if (dir.includes('Catalog')) return 'catalog';
  if (dir.includes('Decals')) return 'decals';
  if (dir.includes('Entities')) return 'entities';
  return null;
}

export class HttpResourceProvider implements ResourceProvider {
  readonly forkName: string;
  readonly isLocal = false;
  private baseUrl: string;

  constructor(baseUrl: string = '', forkName: string = 'Built-in') {
    this.baseUrl = baseUrl;
    this.forkName = forkName;
  }

  async listFiles(dir: string, ext: string): Promise<string[]> {
    const listUrl = `${this.baseUrl}/resources-list?dir=${encodeURIComponent(dir)}&ext=${encodeURIComponent(ext)}`;
    try {
      const res = await fetch(listUrl);
      if (res.ok) return await res.json();
    } catch { /* fall through */ }

    const name = manifestName(dir);
    if (!name) return [];
    const manifestUrl = `${this.baseUrl}/resources/_manifests/${name}.json`;
    const res = await fetch(manifestUrl);
    if (!res.ok) return [];
    return await res.json();
  }

  async readText(path: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/resources${path}`);
    if (!res.ok) throw new Error(`Failed to read ${path}: ${res.status}`);
    return res.text();
  }

  getImageUrl(path: string): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}/resources${normalized}`;
  }

  dispose(): void { }
}

export class FileSystemResourceProvider implements ResourceProvider {
  readonly forkName: string;
  readonly isLocal = true;
  private files: Map<string, File>;
  private blobUrls: string[] = [];

  constructor(files: Map<string, File>, forkName: string) {
    this.files = files;
    this.forkName = forkName;
  }

  async listFiles(dir: string, ext: string): Promise<string[]> {
    const results: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(dir) && key.endsWith(ext)) {
        results.push(`/${key}`);
      }
    }
    return results;
  }

  async readText(path: string): Promise<string> {
    const key = path.startsWith('/') ? path.slice(1) : path;
    const file = this.files.get(key);
    if (!file) throw new Error(`File not found: ${path}`);
    return file.text();
  }

  getImageUrl(path: string): string {
    const key = path.startsWith('/') ? path.slice(1) : path;
    const file = this.files.get(key);
    if (!file) return ''; // Missing file, return empty URL, callers show placeholder
    const url = URL.createObjectURL(file);
    this.blobUrls.push(url);
    return url;
  }

  dispose(): void {
    for (const url of this.blobUrls) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls = [];
    this.files.clear();
  }
}

// ---- Global active provider ----

/** Module-level active provider, set during app initialization. */
let activeProvider: ResourceProvider | null = null;

export function setActiveProvider(provider: ResourceProvider | null): void {
  activeProvider = provider;
}

export function getActiveProvider(): ResourceProvider {
  if (!activeProvider) throw new Error('No ResourceProvider set. Call setActiveProvider() first.');
  return activeProvider;
}
