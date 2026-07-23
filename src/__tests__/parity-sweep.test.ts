/// <reference types="node" />
/**
 * Full-corpus parity sweep against a real fork's Resources/Maps.
 *
 * UNTRACKED dev harness, env-gated so CI and plain checkouts skip it.
 * Run with:
 *   SS14_MAPS_DIR=<fork>/Resources/Maps npx vitest run src/__tests__/parity-sweep.test.ts
 *
 * For every .yml in the corpus: import → export, compare bytes, and verify
 * idempotence (a second import → export of our own output is byte-stable).
 * Byte drift against originals is reported, not failed: known-justified
 * drift exists (v6→v7 chunk upgrades, stale entityCount in game-saved
 * originals). Idempotence failures and import crashes always fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { importMap } from '../import/mapImporter';
import { exportMap } from '../export/mapExporter';
import { findMapFiles } from '../test-utils/realMaps';

const MAPS_DIR = process.env.SS14_MAPS_DIR ?? '';

describe.skipIf(!MAPS_DIR)('full-corpus parity sweep', () => {
  it('round-trips every map in the corpus', () => {
    const files = findMapFiles(MAPS_DIR);
    expect(files.length).toBeGreaterThan(0);

    let identical = 0;
    const drifted: string[] = [];
    const importFailed: string[] = [];
    const nonIdempotent: string[] = [];

    for (const file of files) {
      const original = readFileSync(file, 'utf8');
      let exported: string;
      try {
        exported = exportMap(importMap(original));
      } catch (err) {
        importFailed.push(`${file}: ${err}`);
        continue;
      }
      if (exported === original) {
        identical++;
      } else {
        drifted.push(file);
      }
      // Idempotence: our own output must be a fixed point.
      const second = exportMap(importMap(exported));
      if (second !== exported) {
        nonIdempotent.push(file);
      }
    }

    console.log(`[parity] ${files.length} files: ${identical} byte-identical, ${drifted.length} drifted, ${importFailed.length} import-failed, ${nonIdempotent.length} non-idempotent`);
    for (const f of drifted) console.log(`[parity] drift: ${f}`);
    for (const f of importFailed) console.log(`[parity] FAIL import: ${f}`);
    for (const f of nonIdempotent) console.log(`[parity] FAIL idempotence: ${f}`);

    expect(importFailed).toEqual([]);
    expect(nonIdempotent).toEqual([]);
  }, 300_000);
});
