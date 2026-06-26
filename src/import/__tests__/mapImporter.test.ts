import { describe, it, expect } from 'vitest';
import { importMap } from '../mapImporter';

/**
 * Build a base64-encoded 16x16 chunk where each tile is 6 bytes (format 6):
 *   int32 LE tileIndex + uint8 flags (0) + uint8 variant (0).
 * tileAssignments maps flat tile index (0-255) to tilemap index.
 * Unassigned tiles default to 0 (Space).
 */
function makeChunkBase64(tileAssignments: Record<number, number>): string {
  const BYTES_PER_TILE = 6;
  const buf = new Uint8Array(256 * BYTES_PER_TILE);
  const view = new DataView(buf.buffer);
  for (const [idx, tileIndex] of Object.entries(tileAssignments)) {
    const offset = Number(idx) * BYTES_PER_TILE;
    view.setInt32(offset, tileIndex, true);
    // flags and variant stay 0
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function buildTestMap(): string {
  const chunk00 = makeChunkBase64({ 0: 1, 1: 2, 16: 2 });
  return `meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space
  1: FloorSteel
  2: Plating

entities:
- proto: ""
  entities:
  - uid: 0
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 1
    components:
    - type: MetaData
      name: Station
    - type: Transform
      parent: 0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunk00}
          version: 6
- proto: APCBasic
  entities:
  - uid: 100
    components:
    - type: Transform
      pos: 0.5,0.5
      parent: 1
    - type: Battery
      startingCharge: 25000
`;
}

function buildMultiChunkMap(): string {
  const chunk00 = makeChunkBase64({ 0: 1 });
  const chunk10 = makeChunkBase64({ 0: 2 });
  return `meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space
  1: FloorSteel
  2: Plating

entities:
- proto: ""
  entities:
  - uid: 0
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 1
    components:
    - type: MetaData
      name: Station
    - type: Transform
      parent: 0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunk00}
          version: 6
        1,0:
          ind: 1,0
          tiles: ${chunk10}
          version: 6
`;
}

function buildRotationMap(): string {
  const chunk00 = makeChunkBase64({});
  return `meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space

entities:
- proto: ""
  entities:
  - uid: 0
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 1
    components:
    - type: MetaData
      name: Station
    - type: Transform
      parent: 0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunk00}
          version: 6
- proto: GasVentPump
  entities:
  - uid: 200
    components:
    - type: Transform
      rot: 3.141592653589793
      pos: 5.5,3.5
      parent: 1
`;
}

describe('importMap', () => {
  it('parses meta', () => {
    const result = importMap(buildTestMap());
    expect(result.meta.format).toBe(6);
    expect(result.meta.postmapinit).toBe(false);
  });

  it('parses tilemap', () => {
    const result = importMap(buildTestMap());
    expect(result.tilemap[0]).toBe('Space');
    expect(result.tilemap[1]).toBe('FloorSteel');
    expect(result.tilemap[2]).toBe('Plating');
  });

  it('identifies map and grid UIDs', () => {
    const result = importMap(buildTestMap());
    expect(result.mapUid).toBe(0);
    expect(result.gridUid).toBe(1);
  });

  it('decodes grid from single chunk', () => {
    const result = importMap(buildTestMap());
    expect(result.grid.width).toBe(16);
    expect(result.grid.height).toBe(16);
    expect(result.grid.offsetX).toBe(0);
    expect(result.grid.offsetY).toBe(0);
    // Tile at (0,0) in chunk = flat index 0 -> FloorSteel
    expect(result.grid.cells[0].tileId).toBe('FloorSteel');
    // Tile at (1,0) in chunk = flat index 1 -> Plating
    expect(result.grid.cells[1].tileId).toBe('Plating');
    // Tile at (0,1) in chunk = flat index 16 -> Plating
    expect(result.grid.cells[16].tileId).toBe('Plating');
    // Rest are Space
    expect(result.grid.cells[2].tileId).toBe('Space');
  });

  it('decodes grid from multiple chunks', () => {
    const result = importMap(buildMultiChunkMap());
    expect(result.grid.width).toBe(32);
    expect(result.grid.height).toBe(16);
    // Chunk (0,0) tile 0 -> FloorSteel at grid position (0,0)
    expect(result.grid.cells[0 * 32 + 0].tileId).toBe('FloorSteel');
    // Chunk (1,0) tile 0 -> Plating at grid position (16,0)
    expect(result.grid.cells[0 * 32 + 16].tileId).toBe('Plating');
  });

  it('parses entities with preserved components', () => {
    const result = importMap(buildTestMap());
    const apc = result.entities.find(e => e.prototype === 'APCBasic');
    expect(apc).toBeDefined();
    expect(apc!.uid).toBe(100);
    // Battery component preserved verbatim
    const battery = apc!.components.find((c: any) => c.type === 'Battery');
    expect(battery).toBeDefined();
    expect((battery as any).startingCharge).toBe(25000);
  });

  it('extracts entity position from Transform', () => {
    const result = importMap(buildTestMap());
    const apc = result.entities.find(e => e.prototype === 'APCBasic');
    expect(apc!.position.x).toBeCloseTo(0.5);
    expect(apc!.position.y).toBeCloseTo(0.5);
  });

  it('extracts entity rotation from Transform', () => {
    const result = importMap(buildRotationMap());
    const vent = result.entities.find(e => e.prototype === 'GasVentPump');
    expect(vent).toBeDefined();
    expect(vent!.rotation).toBeCloseTo(Math.PI);
  });

  it('defaults rotation to 0 when not specified', () => {
    const result = importMap(buildTestMap());
    const apc = result.entities.find(e => e.prototype === 'APCBasic');
    expect(apc!.rotation).toBe(0);
  });

  it('does not include structural entities in entity list', () => {
    const result = importMap(buildTestMap());
    // Map entity (uid 0) and grid entity (uid 1) should not be in entities
    expect(result.entities.find(e => e.uid === 0)).toBeUndefined();
    expect(result.entities.find(e => e.uid === 1)).toBeUndefined();
  });

  describe('contained entities', () => {
    function buildContainerMap(): string {
      const chunk00 = makeChunkBase64({});
      return `meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space

entities:
- proto: ""
  entities:
  - uid: 0
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 1
    components:
    - type: MetaData
      name: Station
    - type: Transform
      parent: 0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunk00}
          version: 6
- proto: LockerBotanist
  entities:
  - uid: 100
    components:
    - type: Transform
      pos: 5.5,3.5
      parent: 1
    - type: ContainerContainer
      containers:
        entity_storage: !type:Container
          showEnts: False
          occludes: True
          ents:
          - 101
          - 102
- proto: Crowbar
  entities:
  - uid: 101
    components:
    - type: Transform
      parent: 100
    - type: Physics
      canCollide: False
- proto: Multitool
  entities:
  - uid: 102
    components:
    - type: Transform
      parent: 100
    - type: Physics
      canCollide: False
- proto: APCBasic
  entities:
  - uid: 200
    components:
    - type: Transform
      pos: 10.5,5.5
      parent: 1
`;
    }

    it('separates contained entities from grid entities', () => {
      const map = importMap(buildContainerMap());
      expect(map.entities).toHaveLength(2);
      expect(map.entities.map(e => e.uid).sort()).toEqual([100, 200]);
      expect(map.containedEntities).toBeDefined();
      expect(map.containedEntities![100]).toHaveLength(2);
      expect(map.containedEntities![100].map(e => e.uid).sort()).toEqual([101, 102]);
    });

    it('contained entities preserve their components', () => {
      const map = importMap(buildContainerMap());
      const crowbar = map.containedEntities![100].find(e => e.uid === 101)!;
      expect(crowbar.prototype).toBe('Crowbar');
      expect(crowbar.components).toHaveLength(2);
      expect(crowbar.components.find((c: any) => c.type === 'Transform')).toBeDefined();
      expect(crowbar.components.find((c: any) => c.type === 'Physics')).toBeDefined();
    });

    it('entities without parent field stay in grid entities', () => {
      const map = importMap(buildContainerMap());
      const apc = map.entities.find(e => e.uid === 200);
      expect(apc).toBeDefined();
      expect(apc!.prototype).toBe('APCBasic');
    });

    it('entities with parent equal to grid UID stay in grid entities', () => {
      const map = importMap(buildContainerMap());
      const locker = map.entities.find(e => e.uid === 100);
      expect(locker).toBeDefined();
      expect(locker!.prototype).toBe('LockerBotanist');
    });

    it('returns empty containedEntities when no containers exist', () => {
      const map = importMap(buildTestMap());
      expect(map.containedEntities).toBeDefined();
      expect(Object.keys(map.containedEntities!)).toHaveLength(0);
    });
  });

  describe('YAML document terminator (...)', () => {
    function buildMapWithTerminator(): string {
      const chunk00 = makeChunkBase64({ 0: 1 });
      return `meta:
  format: 6
  postmapinit: false

tilemap:
  0: Space
  1: FloorSteel

entities:
- proto: ""
  entities:
  - uid: 0
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 1
    components:
    - type: MetaData
      name: Station
    - type: Transform
      parent: 0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunk00}
          version: 6
- proto: APCBasic
  entities:
  - uid: 100
    components:
    - type: Transform
      pos: 0.5,0.5
      parent: 1
    - type: Battery
      startingCharge: 25000
...
`;
    }

    it('does not include ... in any entity raw component lines', () => {
      const yaml = buildMapWithTerminator();
      const result = importMap(yaml);

      // Check every entity's raw component lines
      for (const [_uid, lines] of Object.entries(result.entityRawComponents ?? {})) {
        for (const line of lines) {
          expect(line.trim()).not.toBe('...');
        }
      }
    });

    it('sets hasDocumentTerminator to true when file ends with ...', () => {
      const yaml = buildMapWithTerminator();
      const result = importMap(yaml);
      expect(result.hasDocumentTerminator).toBe(true);
    });

    it('sets hasDocumentTerminator to false when file has no ...', () => {
      const result = importMap(buildTestMap());
      expect(result.hasDocumentTerminator).toBeFalsy();
    });
  });

  describe('multi-grid import', () => {
    function buildTwoGridMap(): string {
      // Grid 2: FloorSteel (tile index 7) at position (0,0) in the chunk
      const chunkGrid2 = makeChunkBase64({ 0: 7 });
      // Grid 100: FloorWood (tile index 3) at position (0,0) in the chunk
      const chunkGrid100 = makeChunkBase64({ 0: 3 });

      return `meta:
  format: 7
  postmapinit: false

maps:
- 1

grids:
- 2
- 100

tilemap:
  0: Space
  3: FloorWood
  7: FloorSteel

entities:
- proto: ""
  entities:
  - uid: 1
    components:
    - type: MetaData
      name: Map Entity
    - type: Transform
    - type: Map
      mapPaused: True
  - uid: 2
    components:
    - type: MetaData
      name: Main Station
    - type: Transform
      parent: 1
      pos: 0,0
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunkGrid2}
          version: 6
  - uid: 100
    components:
    - type: MetaData
      name: Shuttle
    - type: Transform
      parent: 1
      pos: 50.5,20.5
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunkGrid100}
          version: 6
- proto: WallSolid
  entities:
  - uid: 3
    components:
    - type: Transform
      pos: 5.5,3.5
      parent: 2
- proto: APCBasic
  entities:
  - uid: 4
    components:
    - type: Transform
      pos: 2.5,1.5
      parent: 100
`;
    }

    it('parses two grids with correct UIDs', () => {
      const result = importMap(buildTwoGridMap());
      expect(result.gridDataList).toBeDefined();
      expect(result.gridDataList!.length).toBe(2);
      expect(result.gridDataList![0].gridUid).toBe(2);
      expect(result.gridDataList![1].gridUid).toBe(100);
    });

    it('assigns grid names from MetaData', () => {
      const result = importMap(buildTwoGridMap());
      expect(result.gridDataList![0].name).toBe('Main Station');
      expect(result.gridDataList![1].name).toBe('Shuttle');
    });

    it('parses world positions from Transform', () => {
      const result = importMap(buildTwoGridMap());
      expect(result.gridDataList![0].worldPosition).toEqual({ x: 0, y: 0 });
      expect(result.gridDataList![1].worldPosition).toEqual({ x: 50.5, y: 20.5 });
    });

    it('builds separate tile grids per grid', () => {
      const result = importMap(buildTwoGridMap());
      // Grid 2 should have FloorSteel at (0,0)
      expect(result.gridDataList![0].grid.cells[0].tileId).toBe('FloorSteel');
      // Grid 100 should have FloorWood at (0,0)
      expect(result.gridDataList![1].grid.cells[0].tileId).toBe('FloorWood');
    });

    it('assigns entities to correct grid by parent', () => {
      const result = importMap(buildTwoGridMap());
      // WallSolid (uid 3) parented to grid 2
      const grid2Entities = result.gridDataList![0].entities;
      expect(grid2Entities.find(e => e.uid === 3)).toBeDefined();
      expect(grid2Entities.find(e => e.prototype === 'WallSolid')).toBeDefined();

      // APCBasic (uid 4) parented to grid 100
      const grid100Entities = result.gridDataList![1].entities;
      expect(grid100Entities.find(e => e.uid === 4)).toBeDefined();
      expect(grid100Entities.find(e => e.prototype === 'APCBasic')).toBeDefined();

      // Entities don't leak to wrong grids
      expect(grid2Entities.find(e => e.uid === 4)).toBeUndefined();
      expect(grid100Entities.find(e => e.uid === 3)).toBeUndefined();
    });

    it('stores per-grid chunkKeyOrder', () => {
      const result = importMap(buildTwoGridMap());
      expect(result.gridDataList![0].chunkKeyOrder).toEqual(['0,0']);
      expect(result.gridDataList![1].chunkKeyOrder).toEqual(['0,0']);
    });

    it('stores per-grid structural components', () => {
      const result = importMap(buildTwoGridMap());
      // Grid 2 should have MetaData, Transform, and MapGrid (stripped of chunks)
      const grid2Comps = result.gridDataList![0].structuralComponents;
      expect(grid2Comps.find((c: any) => c.type === 'MetaData')).toBeDefined();
      expect(grid2Comps.find((c: any) => c.type === 'Transform')).toBeDefined();
      expect(grid2Comps.find((c: any) => c.type === 'MapGrid')).toBeDefined();
      // MapGrid should NOT have chunks key (stripped)
      const mapGrid = grid2Comps.find((c: any) => c.type === 'MapGrid') as any;
      expect(mapGrid.chunks).toBeUndefined();
    });

    it('single-grid maps produce gridDataList with one entry', () => {
      const result = importMap(buildTestMap());
      expect(result.gridDataList).toBeDefined();
      expect(result.gridDataList!.length).toBe(1);
      expect(result.gridDataList![0].gridUid).toBe(1);
    });

    it('populates legacy grid/gridUid/entities for backward compat', () => {
      const result = importMap(buildTwoGridMap());
      // Legacy fields should point to the FIRST grid
      expect(result.gridUid).toBe(2);
      expect(result.grid.cells[0].tileId).toBe('FloorSteel');
      // Legacy entities should contain first grid's entities
      expect(result.entities.find(e => e.uid === 3)).toBeDefined();
    });
  });
});
