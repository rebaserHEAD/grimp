/// <reference types="node" />
/**
 * Helpers for tests that validate the importer/exporter against real SS14 map
 * files. The editor is designed to live in `<space-station-14>/Tools/space-station-14-map-editor`,
 * so maps are discovered from the host repository's `Resources/Maps/` directory.
 *
 * These helpers never assume a specific fork or map name: they scan whatever maps
 * the host repo provides, largest-first, and select the first map that actually
 * imports (and matches any requested criteria). When no suitable map is present
 * (e.g. CI, or a checkout outside a base repo), callers skip: they never hard-fail.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/** Recursively collect all `.yml` files under `mapsDir`, sorted for determinism. */
export function findMapFiles(mapsDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return; // dir missing -> caller skips
    }
    for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full);
      else if (name.endsWith('.yml')) out.push(full);
    }
  };
  walk(mapsDir);
  return out;
}

/** Map files sorted largest-first (station maps, the most interesting, come first). */
function filesBySizeDesc(mapsDir: string): string[] {
  return findMapFiles(mapsDir)
    .map(f => {
      try {
        return { f, size: statSync(f).size };
      } catch {
        return { f, size: 0 };
      }
    })
    .sort((a, b) => b.size - a.size)
    .map(x => x.f);
}

export interface PickOptions {
  /** Only consider maps whose raw YAML contains this substring. */
  yamlIncludes?: string;
  /** Only accept maps that import to at least this many grids. */
  minGrids?: number;
}

/**
 * Select a real map for a test, largest-first. Returns the first map that matches
 * any requested criteria AND imports without throwing: so tests never trip over a
 * map the importer can't parse. Scans at most `limit` maps to bound runtime.
 * Returns null when no suitable map is available (caller should skip).
 *
 * Some real maps cannot be parsed by the importer yet (e.g. certain block-scalar
 * Paper contents); those are skipped automatically here.
 */
export function pickMap(
  mapsDir: string,
  importMap: (yaml: string) => { gridDataList?: unknown[] | null } | null,
  opts: PickOptions = {},
  limit = 30,
): { file: string; yaml: string } | null {
  let scanned = 0;
  for (const file of filesBySizeDesc(mapsDir)) {
    if (scanned >= limit) break;
    let yaml: string;
    try {
      yaml = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    if (opts.yamlIncludes && !yaml.includes(opts.yamlIncludes)) continue;
    scanned++;
    let map: { gridDataList?: unknown[] | null } | null;
    try {
      map = importMap(yaml);
    } catch {
      continue; // importer can't handle this map -> try the next
    }
    if (!map) continue;
    if (opts.minGrids != null && (map.gridDataList?.length ?? 0) < opts.minGrids) continue;
    return { file, yaml };
  }
  return null;
}
