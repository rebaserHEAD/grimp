import { describe, it, expect } from 'vitest';
import { serializePrefab, type SerializePrefabInput } from '../prefabSerializer';
import type { ImportedEntity } from '../../import/mapImporter';
import type { TileGrid, TileCell } from '../../types';

function makeEntity(
  uid: number,
  proto: string,
  x: number,
  y: number,
  components: Record<string, unknown>[] = [],
): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components };
}

function makeGrid(width: number, height: number, offsetX = 0, offsetY = 0): TileGrid {
  const cells: TileCell[] = new Array(width * height);
  for (let i = 0; i < cells.length; i++) cells[i] = { tileId: 'Space' };
  return { width, height, offsetX, offsetY, cells };
}

function setTile(grid: TileGrid, wx: number, wy: number, tileId: string): void {
  const lx = wx - grid.offsetX;
  const ly = wy - grid.offsetY;
  grid.cells[ly * grid.width + lx] = { tileId };
}

describe('serializePrefab', () => {
  it('captures sparse tiles (Space omitted)', () => {
    const grid = makeGrid(10, 10, 0, 0);
    setTile(grid, 2, 3, 'FloorSteel');
    setTile(grid, 3, 3, 'Plating');
    // (4,3) stays Space

    const result = serializePrefab({
      name: 'TestTiles',
      minX: 2,
      minY: 3,
      maxX: 4,
      maxY: 3,
      grid,
      entities: [],
      entityRawComponents: {},
    });

    expect(result.name).toBe('TestTiles');
    expect(result.width).toBe(3);
    expect(result.height).toBe(1);
    expect(result.tiles).toEqual([
      { dx: 0, dy: 0, tileId: 'FloorSteel' },
      { dx: 1, dy: 0, tileId: 'Plating' },
    ]);
  });

  it('captures entities with relative offsets', () => {
    const grid = makeGrid(10, 10, 0, 0);
    const ent1 = makeEntity(100, 'APCBasic', 5, 5);
    const ent2 = makeEntity(101, 'GasVentPump', 7, 6);
    const entOutside = makeEntity(102, 'Table', 20, 20);

    const result = serializePrefab({
      name: 'TestEntities',
      minX: 5,
      minY: 5,
      maxX: 8,
      maxY: 7,
      grid,
      entities: [ent1, ent2, entOutside],
      entityRawComponents: {},
    });

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].dx).toBe(0);
    expect(result.entities[0].dy).toBe(0);
    expect(result.entities[0].prototype).toBe('APCBasic');
    expect(result.entities[1].dx).toBe(2);
    expect(result.entities[1].dy).toBe(1);
    expect(result.entities[1].prototype).toBe('GasVentPump');
  });

  it('preserves rawYamlLines from entityRawComponents', () => {
    const grid = makeGrid(10, 10, 0, 0);
    const ent = makeEntity(50, 'APCBasic', 3, 3, [{ type: 'Transform' }]);
    const rawLines = ['  - type: Transform', '    pos: 3.5,3.5'];

    const result = serializePrefab({
      name: 'RawTest',
      minX: 3,
      minY: 3,
      maxX: 3,
      maxY: 3,
      grid,
      entities: [ent],
      entityRawComponents: { 50: rawLines },
    });

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].rawYamlLines).toEqual(rawLines);
  });

  it('does not include rawYamlLines when entity has no raw data', () => {
    const grid = makeGrid(10, 10, 0, 0);
    const ent = makeEntity(50, 'APCBasic', 3, 3);

    const result = serializePrefab({
      name: 'NoRaw',
      minX: 3,
      minY: 3,
      maxX: 3,
      maxY: 3,
      grid,
      entities: [ent],
      entityRawComponents: {},
    });

    expect(result.entities[0].rawYamlLines).toBeUndefined();
  });

  it('captures device links (only internal links)', () => {
    const grid = makeGrid(10, 10, 0, 0);
    const source = makeEntity(10, 'SignalButton', 2, 2, [
      {
        type: 'DeviceLinkSource',
        linkedPorts: {
          '11': [['Pressed', 'Toggle']],
          '99': [['Pressed', 'Toggle']], // target outside, should be excluded
        },
      },
    ]);
    const target = makeEntity(11, 'DoorBolt', 3, 2);
    const outside = makeEntity(99, 'DoorBolt', 50, 50);

    const result = serializePrefab({
      name: 'LinkTest',
      minX: 2,
      minY: 2,
      maxX: 3,
      maxY: 2,
      grid,
      entities: [source, target, outside],
      entityRawComponents: {},
    });

    expect(result.entities).toHaveLength(2);
    expect(result.deviceLinks).toHaveLength(1);
    expect(result.deviceLinks[0]).toEqual({
      sourceIdx: 0,
      targetIdx: 1,
      port: 'Pressed',
      sink: 'Toggle',
    });
  });

  it('handles multiple port pairs per link', () => {
    const grid = makeGrid(10, 10, 0, 0);
    const source = makeEntity(10, 'SignalButton', 2, 2, [
      {
        type: 'DeviceLinkSource',
        linkedPorts: {
          '11': [['Pressed', 'Toggle'], ['Status', 'Open']],
        },
      },
    ]);
    const target = makeEntity(11, 'DoorBolt', 3, 2);

    const result = serializePrefab({
      name: 'MultiPort',
      minX: 2,
      minY: 2,
      maxX: 3,
      maxY: 2,
      grid,
      entities: [source, target],
      entityRawComponents: {},
    });

    expect(result.deviceLinks).toHaveLength(2);
    expect(result.deviceLinks[0]).toEqual({ sourceIdx: 0, targetIdx: 1, port: 'Pressed', sink: 'Toggle' });
    expect(result.deviceLinks[1]).toEqual({ sourceIdx: 0, targetIdx: 1, port: 'Status', sink: 'Open' });
  });

  it('returns empty prefab for empty selection', () => {
    const grid = makeGrid(10, 10, 0, 0);

    const result = serializePrefab({
      name: 'Empty',
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      grid,
      entities: [],
      entityRawComponents: {},
    });

    expect(result.name).toBe('Empty');
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.tiles).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.deviceLinks).toEqual([]);
  });

  it('handles selection outside grid bounds', () => {
    const grid = makeGrid(5, 5, 0, 0);

    const result = serializePrefab({
      name: 'OutOfBounds',
      minX: 10,
      minY: 10,
      maxX: 12,
      maxY: 12,
      grid,
      entities: [],
      entityRawComponents: {},
    });

    expect(result.width).toBe(3);
    expect(result.height).toBe(3);
    expect(result.tiles).toEqual([]);
  });

  it('preserves entity rotation', () => {
    const grid = makeGrid(10, 10, 0, 0);
    const ent: ImportedEntity = {
      uid: 1,
      prototype: 'APC',
      position: { x: 2.5, y: 3.5 },
      rotation: Math.PI / 2,
      components: [],
    };

    const result = serializePrefab({
      name: 'RotTest',
      minX: 2,
      minY: 3,
      maxX: 2,
      maxY: 3,
      grid,
      entities: [ent],
      entityRawComponents: {},
    });

    expect(result.entities[0].rotation).toBeCloseTo(Math.PI / 2);
  });
});
