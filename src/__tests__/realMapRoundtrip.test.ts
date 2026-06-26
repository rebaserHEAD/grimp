/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { importMap } from '../import/mapImporter';
import { exportMap } from '../export/mapExporter';
import { pickMap } from '../test-utils/realMaps';

// The editor is designed to live in `<space-station-14>/Tools/space-station-14-map-editor`, so real
// maps are discovered from the host repo's Resources/Maps. No fork is assumed; tests
// skip when no maps are present (CI, or a checkout outside a base repo).
const MAPS_DIR = resolve(__dirname, '../../../../Resources/Maps');

/**
 * End-to-end roundtrip test using a real SS14 map file (the largest available
 * station map). Verifies the importer can handle production maps and the exporter
 * produces output that re-imports identically.
 */
describe('real map roundtrip', () => {
  const yamlContent = pickMap(MAPS_DIR, importMap)?.yaml ?? '';
  const skip = yamlContent.length === 0;

  it('imports a real map without throwing', () => {
    if (skip) return;
    const map = importMap(yamlContent);
    expect(map).toBeDefined();
    expect(map.grid.width).toBeGreaterThan(0);
    expect(map.grid.height).toBeGreaterThan(0);
  });

  it('has a reasonable number of tiles and entities', () => {
    if (skip) return;
    const map = importMap(yamlContent);

    // A real station should have many non-Space tiles
    const nonSpaceTiles = map.grid.cells.filter(c => c.tileId !== 'Space');
    expect(nonSpaceTiles.length).toBeGreaterThan(100);

    // And many entities
    expect(map.entities.length).toBeGreaterThan(100);
  });

  it('preserves grid dimensions through roundtrip', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    expect(reimported.grid.width).toBe(original.grid.width);
    expect(reimported.grid.height).toBe(original.grid.height);
    expect(reimported.grid.offsetX).toBe(original.grid.offsetX);
    expect(reimported.grid.offsetY).toBe(original.grid.offsetY);
  });

  it('preserves all tiles through roundtrip', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    expect(reimported.grid.cells.length).toBe(original.grid.cells.length);

    let mismatches = 0;
    for (let i = 0; i < original.grid.cells.length; i++) {
      if (reimported.grid.cells[i].tileId !== original.grid.cells[i].tileId) {
        mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  it('preserves entity count and prototypes through roundtrip', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    expect(reimported.entities.length).toBe(original.entities.length);

    for (const origEntity of original.entities) {
      const match = reimported.entities.find(e => e.uid === origEntity.uid);
      expect(match, `Entity uid=${origEntity.uid} (${origEntity.prototype}) missing after roundtrip`).toBeDefined();
      expect(match!.prototype).toBe(origEntity.prototype);
    }
  });

  it('preserves entity positions and rotations through roundtrip', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    for (const origEntity of original.entities) {
      const match = reimported.entities.find(e => e.uid === origEntity.uid);
      if (!match) continue; // covered by previous test
      expect(match.position.x).toBeCloseTo(origEntity.position.x, 1);
      expect(match.position.y).toBeCloseTo(origEntity.position.y, 1);
      expect(match.rotation).toBeCloseTo(origEntity.rotation, 4);
    }
  });

  it('preserves meta and structural UIDs through roundtrip', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    expect(reimported.meta.format).toBe(original.meta.format);
    expect(reimported.meta.postmapinit).toBe(original.meta.postmapinit);
    expect(reimported.mapUid).toBe(original.mapUid);
    expect(reimported.gridUid).toBe(original.gridUid);
  });

  it('double roundtrip produces identical results', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported1 = exportMap(original);
    const reimported1 = importMap(exported1);
    const exported2 = exportMap(reimported1);
    const reimported2 = importMap(exported2);

    // Grid
    expect(reimported2.grid.cells.length).toBe(reimported1.grid.cells.length);
    for (let i = 0; i < reimported1.grid.cells.length; i++) {
      expect(reimported2.grid.cells[i].tileId).toBe(reimported1.grid.cells[i].tileId);
    }

    // Entities
    expect(reimported2.entities.length).toBe(reimported1.entities.length);

    // Export should be idempotent, second export identical to first
    expect(exported2).toBe(exported1);
  });

  it('produces semantically equivalent output to original file', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    // Tile types must match (variants may differ, the editor resets variants to 0
    // on export since it has no variant editing capability)
    expect(reimported.grid.width).toBe(original.grid.width);
    expect(reimported.grid.height).toBe(original.grid.height);
    for (let i = 0; i < original.grid.cells.length; i++) {
      expect(reimported.grid.cells[i].tileId).toBe(original.grid.cells[i].tileId);
    }
    // Entity count must match
    expect(reimported.entities.length).toBe(original.entities.length);
  });
});

/**
 * Decal preservation test, confirms that DecalGrid component data
 * (stored on the grid structural entity) survives import → export intact.
 */
describe('decal preservation', () => {
  // Pick the first importable map that actually contains decal data.
  const yamlContent = pickMap(MAPS_DIR, importMap, { yamlIncludes: '- type: DecalGrid' })?.yaml ?? '';
  const skip = yamlContent.length === 0;

  it('original map contains DecalGrid data', () => {
    if (skip) return;
    expect(yamlContent).toContain('DecalGrid');
    expect(yamlContent).toContain('chunkCollection');
    expect(yamlContent).toContain('decals:');
  });

  it('DecalGrid data survives import → export roundtrip', () => {
    if (skip) return;
    const map = importMap(yamlContent);
    const exported = exportMap(map);

    // Extract all DecalGrid lines from original and exported
    const originalDecalLines = yamlContent.split('\n').filter(l =>
      l.includes('DecalGrid') || l.includes('chunkCollection') ||
      l.includes('decals:') || l.match(/^\s+\d+:/) // decal ID: coordinate lines
    );
    const exportedDecalLines = exported.split('\n').filter(l =>
      l.includes('DecalGrid') || l.includes('chunkCollection') ||
      l.includes('decals:') || l.match(/^\s+\d+:/)
    );

    expect(exportedDecalLines.length).toBe(originalDecalLines.length);
    for (let i = 0; i < originalDecalLines.length; i++) {
      expect(exportedDecalLines[i]).toBe(originalDecalLines[i]);
    }
  });

  it('DecalGrid survives double roundtrip', () => {
    if (skip) return;
    const map1 = importMap(yamlContent);
    const exported1 = exportMap(map1);
    const map2 = importMap(exported1);
    const exported2 = exportMap(map2);

    // DecalGrid section should be identical after two roundtrips
    const getDecalSection = (yml: string) => {
      const lines = yml.split('\n');
      const start = lines.findIndex(l => l.includes('DecalGrid'));
      if (start < 0) return '';
      // Find the end: next component (line starting with "    - type:")
      let end = start + 1;
      while (end < lines.length && !lines[end].match(/^\s{4}- type:/)) {
        end++;
      }
      return lines.slice(start, end).join('\n');
    };

    const decals1 = getDecalSection(exported1);
    const decals2 = getDecalSection(exported2);
    expect(decals1.length).toBeGreaterThan(0);
    expect(decals2).toBe(decals1);
  });

  it('decal count is preserved through roundtrip', () => {
    if (skip) return;
    // Count decal entries (lines matching "            NNNN: X,Y" pattern)
    const countDecals = (yml: string) => {
      return yml.split('\n').filter(l => l.match(/^\s{12}\d+:\s+[\d.]+,[\d.]+/)).length;
    };

    const originalCount = countDecals(yamlContent);
    expect(originalCount).toBeGreaterThan(0);

    const map = importMap(yamlContent);
    const exported = exportMap(map);
    const exportedCount = countDecals(exported);

    expect(exportedCount).toBe(originalCount);
  });

  it('parsed decal count matches YAML decal entries', () => {
    if (skip) return;
    const map = importMap(yamlContent);

    // Count decal entries within the DecalGrid section of the original YAML.
    // We isolate the DecalGrid block first, then count "ID: x,y" lines.
    const lines = yamlContent.split('\n');
    const decalGridStart = lines.findIndex(l => l.includes('- type: DecalGrid'));
    expect(decalGridStart).toBeGreaterThan(-1);

    // Find the end of the DecalGrid component (next "    - type:" line)
    let decalGridEnd = decalGridStart + 1;
    while (decalGridEnd < lines.length && !lines[decalGridEnd].match(/^\s{4}- type:/)) {
      decalGridEnd++;
    }

    const decalSection = lines.slice(decalGridStart, decalGridEnd);
    // Decal entries are lines like "            1113: 10.711808,16.843641"
    const yamlDecalCount = decalSection
      .filter(l => l.match(/^\s{12}\d+:\s+[\d.,-]+\s*$/)).length;

    // Count parsed decals from the first grid
    const gridDecals = map.gridDataList?.[0]?.decals?.decals ?? [];

    expect(yamlDecalCount).toBeGreaterThan(0);
    expect(gridDecals.length).toBe(yamlDecalCount);
  });
});

/**
 * Semantic roundtrip on a large map (exercises GridAtmosphere integer key ordering
 * and other large-map structures).
 */
describe('large map semantic roundtrip', () => {
  const yamlContent = pickMap(MAPS_DIR, importMap)?.yaml ?? '';
  const skip = yamlContent.length === 0;

  it('produces semantically equivalent output to original file', () => {
    if (skip) return;
    const original = importMap(yamlContent);
    const exported = exportMap(original);
    const reimported = importMap(exported);

    expect(reimported.grid.width).toBe(original.grid.width);
    expect(reimported.grid.height).toBe(original.grid.height);
    for (let i = 0; i < original.grid.cells.length; i++) {
      expect(reimported.grid.cells[i].tileId).toBe(original.grid.cells[i].tileId);
    }
    expect(reimported.entities.length).toBe(original.entities.length);
  });
});
