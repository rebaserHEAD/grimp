import { describe, it, expect } from 'vitest';
import { exportMap } from '../mapExporter';
import { importMap, ImportedMap } from '../../import/mapImporter';

/**
 * From-scratch document synthesis: shapes must match what the game's own
 * serializer emits (savemap / savegrid). Golden reference: any game-saved
 * grid file, e.g. Resources/Maps/Shuttles/wizard.yml in a fork checkout:
 *
 *   meta.category: Grid, format 7, maps: [], grids: [uid], orphans: [uid],
 *   nullspace: [], grid root = bare MetaData + Transform `parent: invalid`
 *   + MapGrid. No postmapinit key. No map entity at all.
 *
 * Map documents mirror the savemap shape: category: Map, maps: [mapUid],
 * grid Transform parented to the map entity.
 */

function makeCells(): { tileId: string }[] {
  return Array(256).fill(null).map((_, i) => ({
    tileId: i === 0 ? 'FloorSteel' : 'Space',
  }));
}

/** A from-scratch grid document: no imported structural data, no uid lists. */
function makeNewGridDocument(): ImportedMap {
  return {
    meta: { format: 7, category: 'Grid', entityCount: 0 },
    tilemap: {},
    grid: { width: 16, height: 16, offsetX: 0, offsetY: 0, cells: makeCells() },
    entities: [
      {
        uid: 2,
        prototype: 'APCBasic',
        position: { x: 0.5, y: 0.5 },
        rotation: 0,
        components: [{ type: 'Transform', pos: '0.5,0.5', parent: 1 }],
      },
    ],
    gridUid: 1,
    mapUid: -1, // grid documents have no map entity
  };
}

/** A from-scratch map document at format 7. */
function makeNewMapDocument(): ImportedMap {
  return {
    meta: { format: 7, category: 'Map', entityCount: 0 },
    tilemap: {},
    grid: { width: 16, height: 16, offsetX: 0, offsetY: 0, cells: makeCells() },
    entities: [],
    gridUid: 1,
    mapUid: 0,
  };
}

describe('grid document export (from scratch)', () => {
  it('emits the savegrid top-level shape', () => {
    const yaml = exportMap(makeNewGridDocument());
    expect(yaml).toContain('  category: Grid');
    expect(yaml).toContain('maps: []');
    expect(yaml).toMatch(/grids:\n- 1\n/);
    expect(yaml).toMatch(/orphans:\n- 1\n/);
    expect(yaml).toContain('nullspace: []');
  });

  it('emits no map entity, only the grid root', () => {
    const yaml = exportMap(makeNewGridDocument());
    // Structural section must contain exactly one uid (the grid)
    expect(yaml).not.toContain('- type: Map\n');
    expect(yaml).not.toContain('mapPaused');
    expect(yaml).not.toContain('- type: Broadphase');
    expect(yaml).not.toContain('- type: OccluderTree');
    expect(yaml).not.toContain('uid: -1');
  });

  it('grid root Transform is parentless via `parent: invalid`', () => {
    const yaml = exportMap(makeNewGridDocument());
    expect(yaml).toContain('parent: invalid');
    // The grid root must not be parented to a fabricated map uid
    expect(yaml).not.toMatch(/uid: 1\n\s+components:\n(.*\n)*?\s+parent: 0\n/);
  });

  it('does not invent a MetaData name for the grid', () => {
    const yaml = exportMap(makeNewGridDocument());
    expect(yaml).not.toContain('name: Station');
  });

  it('does not emit postmapinit when meta omits it', () => {
    const yaml = exportMap(makeNewGridDocument());
    expect(yaml).not.toContain('postmapinit');
  });

  it('round-trips through the importer as a grid file', () => {
    const yaml = exportMap(makeNewGridDocument());
    const reimported = importMap(yaml);
    expect(reimported.meta.category).toBe('Grid');
    expect(reimported.maps).toEqual([]);
    expect(reimported.orphans).toEqual([1]);
    expect(reimported.grids).toEqual([1]);
    // And the re-export is stable
    expect(exportMap(reimported)).toBe(yaml);
  });

  it('placed entities still parent to the grid', () => {
    const yaml = exportMap(makeNewGridDocument());
    const reimported = importMap(yaml);
    const apc = reimported.entities.find(e => e.prototype === 'APCBasic');
    expect(apc).toBeDefined();
    const xform = apc!.components.find((c: any) => c.type === 'Transform') as any;
    expect(xform.parent).toBe(1);
  });
});

describe('map document export (from scratch, format 7)', () => {
  it('emits the savemap top-level shape', () => {
    const yaml = exportMap(makeNewMapDocument());
    expect(yaml).toContain('  category: Map');
    expect(yaml).toMatch(/maps:\n- 0\n/);
    expect(yaml).toMatch(/grids:\n- 1\n/);
    expect(yaml).toContain('orphans: []');
    expect(yaml).toContain('nullspace: []');
  });

  it('synthesizes map + grid structural entities with the grid parented', () => {
    const yaml = exportMap(makeNewMapDocument());
    expect(yaml).toContain('- type: Map');
    expect(yaml).toContain('parent: 0');
    expect(yaml).not.toContain('name: Station');
  });
});
