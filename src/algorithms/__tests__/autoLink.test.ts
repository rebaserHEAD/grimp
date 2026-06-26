import { describe, it, expect } from 'vitest';
import { floodFillRoom, autoLinkDeviceList } from '../autoLink';
import type { ImportedEntity } from '../../import/mapImporter';
import type { TileGrid, TileCell } from '../../types';
import type { IPrototypeRegistry, ResolvedEntity, ResolvedTile, SpriteInfo, DecalPrototypeInfo, RawComponent } from '../../loaders/registryTypes';

// ---- Helpers ----

function makeEntity(
  uid: number,
  prototype: string,
  x: number,
  y: number,
  components: Record<string, unknown>[] = [],
): ImportedEntity {
  return { uid, prototype, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components };
}

function makeGrid(width: number, height: number, tileId: string = 'FloorSteel'): TileGrid {
  const cells: TileCell[] = Array.from({ length: width * height }, () => ({ tileId }));
  return { width, height, offsetX: 0, offsetY: 0, cells };
}

function setTile(grid: TileGrid, x: number, y: number, tileId: string): void {
  grid.cells[y * grid.width + x] = { tileId };
}

/**
 * Create a mock registry. `entityComponents` maps prototype ID to component type strings.
 * e.g. { WallSolid: ['Occluder'], AirAlarm: ['DeviceList'] }
 */
function makeMockRegistry(
  entityComponents: Record<string, string[]> = {},
): IPrototypeRegistry {
  return {
    getTile: () => null,
    getEntity: (id: string): ResolvedEntity | null => {
      const compTypes = entityComponents[id];
      if (!compTypes) return null;
      return {
        id,
        name: id,
        description: '',
        suffix: '',
        abstract: false,
        categories: [],
        placement: {},
        components: compTypes.map(t => ({ type: t } as RawComponent)),
        spriteInfo: null,
        sourceCategory: '',
        raw: { type: 'entity', id },
      };
    },
    getAllTiles: () => [],
    getAllEntities: () => [],
    getEntitiesByCategory: () => [],
    getCategories: () => [],
    getSpriteInfo: () => null,
    getDecal: () => null,
    getAllDecals: () => [],
    get tileCount() { return 0; },
    get entityCount() { return 0; },
    get decalCount() { return 0; },
  };
}

// ---- floodFillRoom ----

describe('floodFillRoom', () => {
  it('fills an open room (all tiles reachable)', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry();

    const { roomTiles, boundaryTiles } = floodFillRoom(2, 2, grid, [], registry);

    // All 25 tiles should be room tiles
    expect(roomTiles.size).toBe(25);
    expect(boundaryTiles.size).toBeGreaterThan(0); // edges expand into out-of-bounds → boundary
  });

  it('stops at Space tiles', () => {
    const grid = makeGrid(5, 5);
    // Create a vertical Space barrier at x=2
    for (let y = 0; y < 5; y++) {
      setTile(grid, 2, y, 'Space');
    }
    const registry = makeMockRegistry();

    const { roomTiles } = floodFillRoom(0, 2, grid, [], registry);

    // Should only fill tiles x=0 and x=1 (2 columns × 5 rows = 10 tiles)
    expect(roomTiles.size).toBe(10);
    // No tile with x >= 2 should be in roomTiles
    for (const key of roomTiles) {
      const x = parseInt(key.split(',')[0]);
      expect(x).toBeLessThan(2);
    }
  });

  it('stops at wall entities (Occluder component via registry)', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry({ CustomWallThing: ['Occluder'] });
    // Place wall entities across the middle row (y=2)
    const walls = [
      makeEntity(100, 'CustomWallThing', 0, 2),
      makeEntity(101, 'CustomWallThing', 1, 2),
      makeEntity(102, 'CustomWallThing', 2, 2),
      makeEntity(103, 'CustomWallThing', 3, 2),
      makeEntity(104, 'CustomWallThing', 4, 2),
    ];

    const { roomTiles, boundaryTiles } = floodFillRoom(2, 0, grid, walls, registry);

    // Should only fill top two rows (y=0 and y=1)
    expect(roomTiles.size).toBe(10);
    for (const key of roomTiles) {
      const y = parseInt(key.split(',')[1]);
      expect(y).toBeLessThan(2);
    }
    // Wall tiles should be in boundary
    expect(boundaryTiles.has('2,2')).toBe(true);
  });

  it('stops at wall entities detected by name containing "Wall"', () => {
    const grid = makeGrid(3, 3);
    const registry = makeMockRegistry(); // no Occluder lookup needed, name-based
    const wall = makeEntity(100, 'WallSolid', 1, 1);

    const { roomTiles, boundaryTiles } = floodFillRoom(0, 0, grid, [wall], registry);

    // Center tile (1,1) should be boundary, not room
    expect(boundaryTiles.has('1,1')).toBe(true);
    expect(roomTiles.has('1,1')).toBe(false);
  });

  it('stops at door entities and adds them to boundary', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry();
    // Place airlock doors across x=2 column
    const doors = [
      makeEntity(200, 'AirlockCommand', 2, 0),
      makeEntity(201, 'AirlockCommand', 2, 1),
      makeEntity(202, 'AirlockCommand', 2, 2),
      makeEntity(203, 'AirlockCommand', 2, 3),
      makeEntity(204, 'AirlockCommand', 2, 4),
    ];

    const { roomTiles, boundaryTiles } = floodFillRoom(0, 2, grid, doors, registry);

    // Doors should be boundary
    expect(boundaryTiles.has('2,2')).toBe(true);
    expect(boundaryTiles.has('2,0')).toBe(true);
    // Left side should be room tiles
    expect(roomTiles.has('0,2')).toBe(true);
    expect(roomTiles.has('1,2')).toBe(true);
    // Right side should NOT be reachable
    expect(roomTiles.has('3,2')).toBe(false);
  });

  it('stops at Firelock entities and adds them to boundary', () => {
    const grid = makeGrid(3, 3);
    const registry = makeMockRegistry();
    const firelock = makeEntity(300, 'Firelock', 1, 1);

    const { roomTiles, boundaryTiles } = floodFillRoom(0, 0, grid, [firelock], registry);

    expect(boundaryTiles.has('1,1')).toBe(true);
    expect(roomTiles.has('1,1')).toBe(false);
  });

  it('respects maxTiles safety cap', () => {
    // Large grid but cap at 10
    const grid = makeGrid(20, 20);
    const registry = makeMockRegistry();

    const { roomTiles } = floodFillRoom(10, 10, grid, [], registry, 10);

    expect(roomTiles.size).toBeLessThanOrEqual(10);
  });
});

// ---- autoLinkDeviceList (room-aware) ----

describe('autoLinkDeviceList', () => {
  it('air alarm links vents in same room, NOT vents across wall', () => {
    // 7-wide room with wall barrier at x=3
    const grid = makeGrid(7, 3);
    const registry = makeMockRegistry({
      AirAlarm: ['DeviceList'],
      WallSolid: ['Occluder'],
    });

    // Wall column at x=3
    const walls = [
      makeEntity(50, 'WallSolid', 3, 0),
      makeEntity(51, 'WallSolid', 3, 1),
      makeEntity(52, 'WallSolid', 3, 2),
    ];

    const alarm = makeEntity(1, 'AirAlarm', 1, 1, [
      { type: 'DeviceList', devices: [] },
    ]);
    const ventSameRoom = makeEntity(10, 'GasVentPump', 2, 1);
    const scrubberSameRoom = makeEntity(11, 'GasVentScrubber', 0, 1);
    const ventOtherRoom = makeEntity(12, 'GasVentPump', 5, 1);

    const allEntities = [alarm, ventSameRoom, scrubberSameRoom, ventOtherRoom, ...walls];

    const result = autoLinkDeviceList(alarm, allEntities, grid, registry);

    expect(result).not.toBeNull();
    expect(result!.linkedCount).toBe(2);
    const dl = result!.updatedEntity.components.find(
      c => (c as Record<string, unknown>).type === 'DeviceList',
    ) as Record<string, unknown>;
    expect(dl.devices).toEqual([10, 11]);
    // Vent in other room should NOT be linked
    expect((dl.devices as number[])).not.toContain(12);
  });

  it('fire alarm links firelocks on room boundary', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry({
      FireAlarm: ['DeviceList'],
    });

    // Firelocks at the doorways (boundary)
    const firelock1 = makeEntity(10, 'Firelock', 0, 2);
    const firelock2 = makeEntity(11, 'FirelockGlass', 4, 2);
    // Firelock far away in a different disconnected area
    const firelockFar = makeEntity(12, 'Firelock', 4, 4);

    const alarm = makeEntity(1, 'FireAlarm', 2, 2, [
      { type: 'DeviceList', devices: [] },
    ]);

    const allEntities = [alarm, firelock1, firelock2, firelockFar];

    const result = autoLinkDeviceList(alarm, allEntities, grid, registry);

    expect(result).not.toBeNull();
    // Fire alarm searches boundary tiles, firelocks at (0,2) and (4,2) are boundary
    // firelockFar at (4,4) is also reachable boundary (since it's a Firelock, it's boundary)
    const dl = result!.updatedEntity.components.find(
      c => (c as Record<string, unknown>).type === 'DeviceList',
    ) as Record<string, unknown>;
    const devices = dl.devices as number[];
    expect(devices).toContain(10);
    expect(devices).toContain(11);
    expect(devices).toContain(12);
  });

  it('creates DeviceList from prototype detection (no instance component needed)', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry({
      AirAlarm: ['DeviceList'],
    });

    // Alarm has NO DeviceList instance component, prototype has it
    const alarm = makeEntity(1, 'AirAlarm', 2, 2, []);
    const vent = makeEntity(10, 'GasVentPump', 3, 2);

    const result = autoLinkDeviceList(alarm, [alarm, vent], grid, registry);

    expect(result).not.toBeNull();
    expect(result!.linkedCount).toBe(1);
    // Should have added a DeviceList component
    const dl = result!.updatedEntity.components.find(
      c => (c as Record<string, unknown>).type === 'DeviceList',
    ) as Record<string, unknown>;
    expect(dl).toBeDefined();
    expect(dl.devices).toEqual([10]);
  });

  it('returns null for non-alarm entity', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry({
      APCBasic: ['DeviceList'],
    });

    const entity = makeEntity(1, 'APCBasic', 2, 2, [
      { type: 'DeviceList', devices: [] },
    ]);
    const vent = makeEntity(10, 'GasVentPump', 3, 2);

    const result = autoLinkDeviceList(entity, [entity, vent], grid, registry);
    expect(result).toBeNull();
  });

  it('returns null when no targets in room', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry({
      AirAlarm: ['DeviceList'],
    });

    const alarm = makeEntity(1, 'AirAlarm', 2, 2, [
      { type: 'DeviceList', devices: [] },
    ]);
    const unrelated = makeEntity(10, 'APCBasic', 3, 2);

    const result = autoLinkDeviceList(alarm, [alarm, unrelated], grid, registry);
    expect(result).toBeNull();
  });

  it('skips already-linked devices', () => {
    const grid = makeGrid(5, 5);
    const registry = makeMockRegistry({
      AirAlarm: ['DeviceList'],
    });

    const alarm = makeEntity(1, 'AirAlarm', 2, 2, [
      { type: 'DeviceList', devices: [10] },
    ]);
    const vent = makeEntity(10, 'GasVentPump', 3, 2);
    const scrubber = makeEntity(11, 'GasVentScrubber', 1, 2);

    const result = autoLinkDeviceList(alarm, [alarm, vent, scrubber], grid, registry);

    expect(result).not.toBeNull();
    expect(result!.linkedCount).toBe(1);
    const dl = result!.updatedEntity.components.find(
      c => (c as Record<string, unknown>).type === 'DeviceList',
    ) as Record<string, unknown>;
    // Existing 10 preserved, new 11 appended
    expect(dl.devices).toEqual([10, 11]);
  });
});
