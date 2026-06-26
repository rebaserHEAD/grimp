import { describe, it, expect } from 'vitest';
import { serializePrefab } from '../prefabSerializer';
import { placePrefab } from '../prefabPlacer';
import { parsePrefabJson, stringifyPrefab } from '../prefabIO';
import type { PrefabData } from '../prefabTypes';
import type { ImportedEntity } from '../../import/mapImporter';
import type { TileGrid, TileCell } from '../../types';
import { editorReducer } from '../../state/editorReducer';
import { createInitialState, setCell, getCell, ensureGridContainsBounds } from '../../state/editorState';
import type { EditorState } from '../../state/editorState';
import type { GridData } from '../../state/gridData';

/** Create test state with entities/grid/containedEntities properly synced to grids[0] */
function syncGrids(state: EditorState): EditorState {
  const activeGrid = state.grids[state.activeGridIndex];
  const updated: GridData = {
    ...activeGrid,
    grid: state.grid,
    entities: state.entities,
    containedEntities: state.containedEntities,
  };
  return {
    ...state,
    grids: state.grids.map((g, i) => i === state.activeGridIndex ? updated : g),
  };
}

// ---- Helpers ----

function makeGrid(width: number, height: number, offsetX = 0, offsetY = 0): TileGrid {
  const cells: TileCell[] = new Array(width * height);
  for (let i = 0; i < cells.length; i++) cells[i] = { tileId: 'Space' };
  return { width, height, offsetX, offsetY, cells };
}

function makeEntity(
  uid: number,
  proto: string,
  x: number,
  y: number,
  components: Record<string, unknown>[] = [],
): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components };
}

function setTile(grid: TileGrid, wx: number, wy: number, tileId: string): void {
  const lx = wx - grid.offsetX;
  const ly = wy - grid.offsetY;
  grid.cells[ly * grid.width + lx] = { tileId };
}

// ---- Tests ----

describe('prefab roundtrip: serialize → JSON → parse → place', () => {
  it('entities have correct world positions and rawComponentsMap after roundtrip', () => {
    // 1. Set up a small grid with tiles and entities
    const grid = makeGrid(10, 10, 0, 0);
    setTile(grid, 2, 3, 'FloorSteel');
    setTile(grid, 3, 3, 'Plating');

    const entities: ImportedEntity[] = [
      makeEntity(100, 'APCBasic', 2, 3, [{ type: 'Transform' }]),
      makeEntity(101, 'GasVentPump', 3, 3, [{ type: 'Transform' }, { type: 'AtmosPipeColor', color: '#0055CCFF' }]),
    ];

    const rawLines100 = ['  - type: Transform', '    parent: 1', '    pos: 2.5,3.5'];
    const rawLines101 = ['  - type: Transform', '    parent: 1', '    pos: 3.5,3.5', '  - type: AtmosPipeColor', '    color: "#0055CCFF"'];
    const entityRawComponents: Record<number, string[]> = {
      100: rawLines100,
      101: rawLines101,
    };

    // 2. Serialize
    const prefab = serializePrefab({
      name: 'TestRoundtrip',
      minX: 2, minY: 3, maxX: 3, maxY: 3,
      grid,
      entities,
      entityRawComponents,
    });

    // 3. JSON stringify → parse (simulate file save/load)
    const json = stringifyPrefab(prefab);
    const restored = parsePrefabJson(json);

    // 4. Place on a fresh grid at a different location
    const freshGrid = makeGrid(20, 20, 0, 0);
    const result = placePrefab({
      prefab: restored,
      placeX: 10,
      placeY: 15,
      grid: freshGrid,
      entities: [],
      nextEntityId: 500,
    });

    // 5. Verify entities have correct world positions
    const adds = result.command.entityChanges.filter(ec => ec.action === 'add');
    expect(adds).toHaveLength(2);

    expect(adds[0].entity.prototype).toBe('APCBasic');
    expect(adds[0].entity.position).toEqual({ x: 10.5, y: 15.5 });

    expect(adds[1].entity.prototype).toBe('GasVentPump');
    expect(adds[1].entity.position).toEqual({ x: 11.5, y: 15.5 });

    // 6. rawComponentsMap should be empty, prefab-placed entities have new positions,
    // so original raw YAML lines (which contain stale pos values) must NOT be preserved
    expect(result.rawComponentsMap[500]).toBeUndefined();
    expect(result.rawComponentsMap[501]).toBeUndefined();

    // 7. Verify Transform component pos is updated to match entity position
    const apcTransform = adds[0].entity.components.find((c: any) => c.type === 'Transform') as any;
    expect(apcTransform).toBeDefined();
    expect(apcTransform.pos).toBe('10.5,15.5');

    const ventTransform = adds[1].entity.components.find((c: any) => c.type === 'Transform') as any;
    expect(ventTransform).toBeDefined();
    expect(ventTransform.pos).toBe('11.5,15.5');
  });

  it('tile changes survive the full roundtrip', () => {
    const grid = makeGrid(10, 10, 0, 0);
    setTile(grid, 1, 1, 'FloorSteel');
    setTile(grid, 2, 1, 'Plating');
    setTile(grid, 1, 2, 'FloorWood');

    const prefab = serializePrefab({
      name: 'TileTrip',
      minX: 1, minY: 1, maxX: 2, maxY: 2,
      grid,
      entities: [],
      entityRawComponents: {},
    });

    const json = stringifyPrefab(prefab);
    const restored = parsePrefabJson(json);

    const freshGrid = makeGrid(20, 20, 0, 0);
    const result = placePrefab({
      prefab: restored,
      placeX: 5,
      placeY: 5,
      grid: freshGrid,
      entities: [],
      nextEntityId: 1,
    });

    // Only non-Space tiles produce tile changes
    expect(result.command.tileChanges).toHaveLength(3);

    const tileMap = new Map(
      result.command.tileChanges.map(tc => [`${tc.x},${tc.y}`, tc.after.tileId]),
    );
    expect(tileMap.get('5,5')).toBe('FloorSteel');
    expect(tileMap.get('6,5')).toBe('Plating');
    expect(tileMap.get('5,6')).toBe('FloorWood');
  });
});

describe('prefab roundtrip: serialize → place → undo', () => {
  it('undo returns map to pre-stamp state', () => {
    // 1. Set up initial state with some existing tiles
    let state = createInitialState();
    const grid = makeGrid(20, 20, 0, 0);
    setTile(grid, 5, 5, 'Lattice');
    setTile(grid, 6, 5, 'Lattice');
    state = syncGrids({ ...state, grid, entities: [], nextEntityId: 1 });

    // Snapshot the pre-stamp state
    const originalTile55 = getCell(state.grid, 5, 5)!.tileId;
    const originalTile65 = getCell(state.grid, 6, 5)!.tileId;
    const originalEntityCount = state.entities.length;

    // 2. Create a prefab
    const prefab: PrefabData = {
      name: 'TestUndo',
      width: 2,
      height: 1,
      tiles: [
        { dx: 0, dy: 0, tileId: 'FloorSteel' },
        { dx: 1, dy: 0, tileId: 'FloorSteel' },
      ],
      entities: [
        { dx: 0, dy: 0, prototype: 'APCBasic', rotation: 0, components: [{ type: 'Transform' }] },
      ],
      deviceLinks: [],
    };

    // 3. Place prefab → get command
    const result = placePrefab({
      prefab,
      placeX: 5,
      placeY: 5,
      grid: state.grid,
      entities: state.entities,
      nextEntityId: state.nextEntityId,
    });

    // 4. Dispatch APPLY_COMMAND
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: result.command });

    // Verify tiles and entities changed
    expect(getCell(state.grid, 5, 5)!.tileId).toBe('FloorSteel');
    expect(getCell(state.grid, 6, 5)!.tileId).toBe('FloorSteel');
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].prototype).toBe('APCBasic');

    // 5. Dispatch UNDO
    state = editorReducer(state, { type: 'UNDO' });

    // Verify map returned to original state
    expect(getCell(state.grid, 5, 5)!.tileId).toBe(originalTile55);
    expect(getCell(state.grid, 6, 5)!.tileId).toBe(originalTile65);
    expect(state.entities).toHaveLength(originalEntityCount);
  });

  it('undo restores removed entities that were in the prefab footprint', () => {
    let state = createInitialState();
    const grid = makeGrid(20, 20, 0, 0);
    const existingEntity = makeEntity(50, 'Chair', 5, 5);
    state = syncGrids({ ...state, grid, entities: [existingEntity], nextEntityId: 51 });

    const prefab: PrefabData = {
      name: 'OverwriteTest',
      width: 1,
      height: 1,
      tiles: [{ dx: 0, dy: 0, tileId: 'FloorSteel' }],
      entities: [
        { dx: 0, dy: 0, prototype: 'Table', rotation: 0, components: [] },
      ],
      deviceLinks: [],
    };

    const result = placePrefab({
      prefab,
      placeX: 5,
      placeY: 5,
      grid: state.grid,
      entities: state.entities,
      nextEntityId: state.nextEntityId,
    });

    // Apply
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: result.command });
    expect(state.entities.find(e => e.uid === 50)).toBeUndefined();
    expect(state.entities.find(e => e.prototype === 'Table')).toBeDefined();

    // Undo, existing entity should be restored
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].uid).toBe(50);
    expect(state.entities[0].prototype).toBe('Chair');
  });
});

describe('prefab roundtrip: device links survive', () => {
  it('device links map to new UIDs correctly after serialize → parse → place', () => {
    const grid = makeGrid(10, 10, 0, 0);
    setTile(grid, 2, 2, 'FloorSteel');
    setTile(grid, 3, 2, 'FloorSteel');

    const source = makeEntity(10, 'SignalButton', 2, 2, [
      {
        type: 'DeviceLinkSource',
        linkedPorts: {
          '11': [['Pressed', 'Toggle']],
        },
      },
    ]);
    const target = makeEntity(11, 'Airlock', 3, 2, [{ type: 'Transform' }]);

    // Serialize
    const prefab = serializePrefab({
      name: 'LinkRoundtrip',
      minX: 2, minY: 2, maxX: 3, maxY: 2,
      grid,
      entities: [source, target],
      entityRawComponents: {},
    });

    // Verify serialized device links
    expect(prefab.deviceLinks).toHaveLength(1);
    expect(prefab.deviceLinks[0]).toEqual({
      sourceIdx: 0, targetIdx: 1, port: 'Pressed', sink: 'Toggle',
    });

    // JSON roundtrip
    const json = stringifyPrefab(prefab);
    const restored = parsePrefabJson(json);

    // Place at a new location with different starting UID
    const freshGrid = makeGrid(20, 20, 0, 0);
    const result = placePrefab({
      prefab: restored,
      placeX: 10,
      placeY: 10,
      grid: freshGrid,
      entities: [],
      nextEntityId: 300,
    });

    // Verify device links reference new UIDs
    expect(result.resolvedDeviceLinks).toHaveLength(1);
    expect(result.resolvedDeviceLinks[0]).toEqual({
      sourceUid: 300,
      targetUid: 301,
      port: 'Pressed',
      sink: 'Toggle',
    });

    // Verify the entities themselves got the right UIDs
    const adds = result.command.entityChanges.filter(ec => ec.action === 'add');
    expect(adds[0].entity.uid).toBe(300);
    expect(adds[0].entity.prototype).toBe('SignalButton');
    expect(adds[1].entity.uid).toBe(301);
    expect(adds[1].entity.prototype).toBe('Airlock');
  });

  it('multiple device links with multiple port pairs survive roundtrip', () => {
    const grid = makeGrid(10, 10, 0, 0);

    const source = makeEntity(20, 'SignalButton', 1, 1, [
      {
        type: 'DeviceLinkSource',
        linkedPorts: {
          '21': [['Pressed', 'Toggle'], ['Status', 'Open']],
          '22': [['Pressed', 'Toggle']],
        },
      },
    ]);
    const target1 = makeEntity(21, 'Airlock', 2, 1);
    const target2 = makeEntity(22, 'BlastDoor', 1, 2);

    const prefab = serializePrefab({
      name: 'MultiLink',
      minX: 1, minY: 1, maxX: 2, maxY: 2,
      grid,
      entities: [source, target1, target2],
      entityRawComponents: {},
    });

    const json = stringifyPrefab(prefab);
    const restored = parsePrefabJson(json);

    const result = placePrefab({
      prefab: restored,
      placeX: 0,
      placeY: 0,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 1000,
    });

    expect(result.resolvedDeviceLinks).toHaveLength(3);
    expect(result.resolvedDeviceLinks[0]).toEqual({
      sourceUid: 1000, targetUid: 1001, port: 'Pressed', sink: 'Toggle',
    });
    expect(result.resolvedDeviceLinks[1]).toEqual({
      sourceUid: 1000, targetUid: 1001, port: 'Status', sink: 'Open',
    });
    expect(result.resolvedDeviceLinks[2]).toEqual({
      sourceUid: 1000, targetUid: 1002, port: 'Pressed', sink: 'Toggle',
    });
  });
});

describe('prefab roundtrip: edge cases', () => {
  it('empty prefab placement produces no changes', () => {
    const prefab: PrefabData = {
      name: 'Empty',
      width: 0,
      height: 0,
      tiles: [],
      entities: [],
      deviceLinks: [],
    };

    const result = placePrefab({
      prefab,
      placeX: 5,
      placeY: 5,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 1,
    });

    expect(result.command.tileChanges).toHaveLength(0);
    expect(result.command.entityChanges).toHaveLength(0);
    expect(result.resolvedDeviceLinks).toHaveLength(0);
    expect(Object.keys(result.rawComponentsMap)).toHaveLength(0);
  });

  it('empty prefab applied to reducer does not change state', () => {
    let state = createInitialState();
    const grid = makeGrid(10, 10, 0, 0);
    setTile(grid, 3, 3, 'FloorSteel');
    state = syncGrids({ ...state, grid, entities: [makeEntity(1, 'Chair', 3, 3)], nextEntityId: 2 });

    const prefab: PrefabData = {
      name: 'Empty',
      width: 0,
      height: 0,
      tiles: [],
      entities: [],
      deviceLinks: [],
    };

    const result = placePrefab({
      prefab,
      placeX: 0,
      placeY: 0,
      grid: state.grid,
      entities: state.entities,
      nextEntityId: state.nextEntityId,
    });

    const newState = editorReducer(state, { type: 'APPLY_COMMAND', command: result.command });

    // Tile and entity data should be unchanged
    expect(getCell(newState.grid, 3, 3)!.tileId).toBe('FloorSteel');
    expect(newState.entities).toHaveLength(1);
    expect(newState.entities[0].uid).toBe(1);
  });

  it('prefab with entities but no tiles only adds entities', () => {
    const prefab: PrefabData = {
      name: 'EntitiesOnly',
      width: 2,
      height: 1,
      tiles: [],
      entities: [
        { dx: 0, dy: 0, prototype: 'Light', rotation: 0, components: [] },
        { dx: 1, dy: 0, prototype: 'Camera', rotation: 0, components: [] },
      ],
      deviceLinks: [],
    };

    const result = placePrefab({
      prefab,
      placeX: 5,
      placeY: 5,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 1,
    });

    expect(result.command.tileChanges).toHaveLength(0);
    const adds = result.command.entityChanges.filter(ec => ec.action === 'add');
    expect(adds).toHaveLength(2);
    expect(adds[0].entity.position).toEqual({ x: 5.5, y: 5.5 });
    expect(adds[1].entity.position).toEqual({ x: 6.5, y: 5.5 });
  });

  it('preserves spriteStateOverride through prefab serialize and place', () => {
    const grid = makeGrid(2, 2);
    setCell(grid, 0, 0, { tileId: 'FloorSteel' });

    const entities: ImportedEntity[] = [{
      uid: 1,
      prototype: 'ClosetBase',
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      components: [{ type: 'Transform', pos: '0.5,0.5', parent: 1 }],
      spriteStateOverride: 'generic_open',
    }];

    const prefab = serializePrefab({
      name: 'state-test',
      minX: 0, minY: 0, maxX: 1, maxY: 1,
      grid, entities,
      entityRawComponents: {},
    });

    expect(prefab.entities[0].spriteStateOverride).toBe('generic_open');

    // JSON roundtrip (simulating save/load)
    const json = JSON.stringify(prefab);
    const restored = JSON.parse(json) as PrefabData;
    expect(restored.entities[0].spriteStateOverride).toBe('generic_open');

    // Place roundtrip
    const result = placePrefab({
      prefab: restored,
      placeX: 5, placeY: 5,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 100,
    });

    const placed = result.command.entityChanges.filter(ec => ec.action === 'add');
    expect(placed[0].entity.spriteStateOverride).toBe('generic_open');
  });
});
