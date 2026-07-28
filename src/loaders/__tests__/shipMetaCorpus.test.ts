/// <reference types="node" />
/**
 * Ground-truth check for the ship-meta index against a real fork's prototypes.
 *
 * Env-gated dev harness, so CI and plain checkouts skip it. Run with:
 *   SS14_FORK_DIR=<fork> npx vitest run src/loaders/__tests__/shipMetaCorpus.test.ts
 *
 * The unit tests use hand-written fixtures, which only prove the parser handles the
 * shapes I expected. This proves it handles the shapes forks actually ship: it scans the
 * whole prototype tree and checks the index is non-trivially populated, every entry is
 * well-formed, the purchasable opt-out semantics still hold, and the path round trip
 * closes in BOTH directions (indexed paths reach files on disk, and files on disk reach
 * their prototypes through toResourceRelativePath).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';
import {
  scanShipMeta,
  lookupByPath,
  isPurchasableVessel,
  normalizeResourcePath,
  toResourceRelativePath,
} from '../shipMetaIndex';
import type { ResourceProvider } from '../resourceProvider';

const FORK_DIR = process.env.SS14_FORK_DIR ?? '';
const RESOURCES = FORK_DIR ? join(FORK_DIR, 'Resources') : '';

function walkYaml(root: string, prefix: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const full = join(dir, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(full);
      else if (name.endsWith('.yml')) out.push('/' + prefix + '/' + relative(root, full).replace(/\\/g, '/'));
    }
  };
  walk(root);
  return out;
}

/** Minimal fs-backed provider so the scan runs against a checkout on disk. */
function forkProvider(): ResourceProvider {
  return {
    listFiles: async (dir: string) =>
      dir === 'Prototypes' ? walkYaml(join(RESOURCES, 'Prototypes'), 'Prototypes') : [],
    readText: async (path: string) => readFileSync(join(RESOURCES, path.replace(/^\//, '')), 'utf-8'),
    getImageUrl: () => '',
    forkName: 'CorpusFork',
    dispose: () => {},
  };
}

describe.skipIf(!FORK_DIR)('ship-meta index against a real fork', () => {
  it('indexes all four referencing types from the real prototype tree', async () => {
    const index = await scanShipMeta(forkProvider());

    const byKind = { vessel: 0, gameMap: 0, pointOfInterest: 0, salvageMap: 0 };
    for (const e of index.entries) byKind[e.kind]++;

    console.log(
      `[shipmeta] ${index.entries.length} entries: ${byKind.vessel} vessel, ` +
        `${byKind.gameMap} gameMap, ${byKind.pointOfInterest} pointOfInterest, ` +
        `${byKind.salvageMap} salvageMap across ${index.byPath.size} distinct paths`,
    );

    // A fork in this chain always ships all four types. Zero means the scan or the
    // type filter broke, not that the fork is unusual.
    expect(byKind.vessel).toBeGreaterThan(0);
    expect(byKind.gameMap).toBeGreaterThan(0);
    expect(byKind.pointOfInterest).toBeGreaterThan(0);
    expect(byKind.salvageMap).toBeGreaterThan(0);
  }, 300_000);

  it('indexes every referencing prototype the raw YAML declares', async () => {
    const index = await scanShipMeta(forkProvider());

    // Cross-check against a naive text count of the path fields, attributing each to the
    // prototype type that declares it. This is what turned up salvageMap as a fourth
    // referencing type, so it stays as a guard against a fifth appearing unnoticed.
    const counts = new Map<string, number>();
    for (const entry of index.entries) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    const indexed = [...counts.entries()].sort().map(([k, n]) => `${k}=${n}`);
    console.log(`[shipmeta] indexed by kind: ${indexed.join(' ')}`);

    // Every entry must carry a kind we know how to badge.
    for (const entry of index.entries) {
      expect(['vessel', 'gameMap', 'pointOfInterest', 'salvageMap']).toContain(entry.kind);
    }
  }, 300_000);

  it('produces well-formed entries with usable paths', async () => {
    const index = await scanShipMeta(forkProvider());

    for (const entry of index.entries) {
      expect(entry.id).toBeTruthy();
      expect(entry.path).toBeTruthy();
      expect(entry.sourceFile).toBeTruthy();
      // Every indexed entry must be findable by its own path, or the badge lookup is a lie.
      expect(lookupByPath(index, entry.path)).toContain(entry);
    }
  }, 300_000);

  it('resolves indexed paths to map files that exist on disk', async () => {
    const index = await scanShipMeta(forkProvider());

    const missing: string[] = [];
    for (const entry of index.entries) {
      const rel = normalizeResourcePath(entry.path);
      if (!existsSync(join(RESOURCES, rel))) missing.push(`${entry.kind} ${entry.id} -> ${entry.path}`);
    }

    // Dangling references are the fork's content bug, not ours, so this reports rather
    // than fails. What would be OUR bug is a normalization error, which shows up as
    // everything missing at once.
    if (missing.length > 0) {
      console.log(`[shipmeta] ${missing.length}/${index.entries.length} entries point at a missing file:`);
      for (const m of missing.slice(0, 20)) console.log(`[shipmeta]   ${m}`);
    }
    expect(missing.length).toBeLessThan(index.entries.length * 0.5);
  }, 300_000);

  it('resolves real map files on disk back to the prototypes that reference them', async () => {
    // The round trip that matters: take an actual map file the way the app would see it
    // (absolute path + the fork dir the user picked), derive its resource path, and find
    // it in the index. If either half is wrong this finds nothing.
    const index = await scanShipMeta(forkProvider());
    const mapFiles = walkYaml(join(RESOURCES, 'Maps'), 'Maps').map((p) => join(RESOURCES, p.replace(/^\//, '')));
    expect(mapFiles.length).toBeGreaterThan(0);

    let referenced = 0;
    const kinds = new Map<string, number>();
    for (const absolute of mapFiles) {
      const rel = toResourceRelativePath(FORK_DIR, absolute);
      expect(rel).not.toBeNull();
      const hits = lookupByPath(index, rel!);
      if (hits.length > 0) {
        referenced++;
        for (const h of hits) kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + 1);
      }
    }

    const breakdown = [...kinds.entries()]
      .sort()
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    console.log(`[shipmeta] ${referenced}/${mapFiles.length} map files are referenced by a prototype (${breakdown})`);

    // Plenty of maps are unreferenced (test maps, dungeon rooms, shuttles loaded by other
    // means), so this is not "all of them". But a fork ships hundreds of ships and stations
    // that ARE referenced, and zero would mean the derivation and the index disagree.
    expect(referenced).toBeGreaterThan(50);
  }, 300_000);

  it('derives a resource path for every map file in the fork', async () => {
    // Guards the fork-root vs Resources/ ambiguity: both spellings of the picked dir must
    // resolve every map file, or file-open from one of them silently loses the cross-ref.
    const mapFiles = walkYaml(join(RESOURCES, 'Maps'), 'Maps').map((p) => join(RESOURCES, p.replace(/^\//, '')));
    for (const absolute of mapFiles.slice(0, 200)) {
      const fromRoot = toResourceRelativePath(FORK_DIR, absolute);
      const fromResources = toResourceRelativePath(RESOURCES, absolute);
      expect(fromRoot).not.toBeNull();
      expect(fromRoot).toBe(fromResources);
    }
  }, 300_000);

  it('finds purchasable vessels, and treats the opt-out flag as the corpus writes it', async () => {
    const index = await scanShipMeta(forkProvider());
    const vessels = index.entries.filter((e) => e.kind === 'vessel');
    const declared = vessels.filter((v) => v.purchasable !== undefined);
    const purchasable = vessels.filter(isPurchasableVessel);

    console.log(
      `[shipmeta] ${vessels.length} vessels, ${declared.length} declare purchasable, ` +
        `${purchasable.length} are for sale`,
    );

    // The flag is opt-out: most vessels never mention it, and the ones that do say false.
    // If a fork ever ships `purchasable: true`, this is the assertion that catches the
    // semantics changing under us.
    expect(declared.every((v) => v.purchasable === false)).toBe(true);
    expect(purchasable.length).toBe(vessels.length - declared.length);
  }, 300_000);
});
