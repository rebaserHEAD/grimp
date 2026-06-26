/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { importMap } from '../mapImporter';
import { exportMap } from '../../export/mapExporter';
import { pickMap } from '../../test-utils/realMaps';

// Maps are discovered from the host repo's Resources/Maps (see test-utils/realMaps).
// We pick the first real map that imports to more than one grid (e.g. a station with
// a docked shuttle) so the multi-grid logic is exercised without assuming any fork or
// map name. Skips when no multi-grid map is available.
const MAPS_DIR = resolve(__dirname, '../../../../../Resources/Maps');
const multiGrid = pickMap(MAPS_DIR, importMap, { minGrids: 2 });

describe('multi-grid roundtrip on real maps', () => {
  it('preserves grid count, tiles, and entity counts through roundtrip', () => {
    if (!multiGrid) return; // no multi-grid map available -> skip
    const map = importMap(multiGrid.yaml);

    const gridCount = map.gridDataList!.length;
    expect(gridCount).toBeGreaterThan(1);
    for (const gd of map.gridDataList!) {
      expect(gd.grid.width).toBeGreaterThan(0);
    }

    // Entities distributed across grids
    let totalEntities = 0;
    for (const gd of map.gridDataList!) {
      totalEntities += gd.entities.length;
      for (const children of Object.values(gd.containedEntities)) {
        totalEntities += children.length;
      }
    }
    expect(totalEntities).toBeGreaterThan(0);

    // Semantic roundtrip: tile types and entity counts must match.
    // Tile variants are reset to 0 on export (editor has no variant editing),
    // so byte-exact comparison is not possible.
    const exported = exportMap(map);
    const reimported = importMap(exported);

    expect(reimported.gridDataList!.length).toBe(gridCount);
    for (let g = 0; g < gridCount; g++) {
      const origGrid = map.gridDataList![g];
      const reGrid = reimported.gridDataList![g];
      expect(reGrid.grid.width).toBe(origGrid.grid.width);
      expect(reGrid.grid.height).toBe(origGrid.grid.height);
      for (let i = 0; i < origGrid.grid.cells.length; i++) {
        expect(reGrid.grid.cells[i].tileId).toBe(origGrid.grid.cells[i].tileId);
      }
      expect(reGrid.entities.length).toBe(origGrid.entities.length);
    }
  });
});

describe('multi-grid structural integrity', () => {
  it('no entity is parented to the wrong grid', () => {
    if (!multiGrid) return; // skip
    const map = importMap(multiGrid.yaml);

    for (const gd of map.gridDataList!) {
      for (const e of gd.entities) {
        const transform = e.components.find((c: any) => c.type === 'Transform') as any;
        if (transform?.parent != null) {
          const isOwnGrid = transform.parent === gd.gridUid;
          const isContainerParent =
            !map.gridDataList!.some(g => g.gridUid === transform.parent) &&
            transform.parent !== map.mapUid;
          expect(isOwnGrid || isContainerParent).toBe(true);
        }
      }
    }
  });
});
