import { describe, it, expect } from 'vitest';
import { placePrefab, type PlacePrefabInput } from '../prefabPlacer';
import type { PrefabData } from '../prefabTypes';
import type { TileGrid } from '../../types';
import type { ImportedEntity } from '../../import/mapImporter';

// ---- Helpers ----

function makeGrid(width: number, height: number, offsetX = 0, offsetY = 0): TileGrid {
  const cells = new Array(width * height);
  for (let i = 0; i < cells.length; i++) cells[i] = { tileId: 'Space' };
  return { width, height, offsetX, offsetY, cells };
}

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

function makePrefab(overrides: Partial<PrefabData> = {}): PrefabData {
  return {
    name: 'test-prefab',
    width: 2,
    height: 2,
    tiles: [
      { dx: 0, dy: 0, tileId: 'FloorSteel' },
      { dx: 1, dy: 0, tileId: 'FloorSteel' },
      { dx: 0, dy: 1, tileId: 'Plating' },
      { dx: 1, dy: 1, tileId: 'Plating' },
    ],
    entities: [],
    deviceLinks: [],
    ...overrides,
  };
}

// ---- Tests ----

describe('placePrefab', () => {
  it('produces tile changes at the placement position', () => {
    const grid = makeGrid(10, 10);
    const result = placePrefab({
      prefab: makePrefab(),
      placeX: 3,
      placeY: 5,
      grid,
      entities: [],
      nextEntityId: 100,
    });

    expect(result.command.tileChanges).toHaveLength(4);
    const tc0 = result.command.tileChanges[0];
    expect(tc0.x).toBe(3);
    expect(tc0.y).toBe(5);
    expect(tc0.before.tileId).toBe('Space');
    expect(tc0.after.tileId).toBe('FloorSteel');

    const tc3 = result.command.tileChanges[3];
    expect(tc3.x).toBe(4);
    expect(tc3.y).toBe(6);
    expect(tc3.after.tileId).toBe('Plating');
  });

  it('records existing tile as before value', () => {
    const grid = makeGrid(10, 10);
    // Set tile at (3,5) to Lattice
    grid.cells[5 * 10 + 3] = { tileId: 'Lattice' };

    const result = placePrefab({
      prefab: makePrefab(),
      placeX: 3,
      placeY: 5,
      grid,
      entities: [],
      nextEntityId: 1,
    });

    expect(result.command.tileChanges[0].before.tileId).toBe('Lattice');
  });

  it('adds entities with new UIDs and correct world positions', () => {
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'APCBasic', rotation: 0, components: [] },
        { dx: 1, dy: 1, prototype: 'GasVentPump', rotation: 1.5708, components: [] },
      ],
    });

    const result = placePrefab({
      prefab,
      placeX: 10,
      placeY: 20,
      grid: makeGrid(40, 40),
      entities: [],
      nextEntityId: 500,
    });

    const adds = result.command.entityChanges.filter((ec) => ec.action === 'add');
    expect(adds).toHaveLength(2);

    expect(adds[0].entity.uid).toBe(500);
    expect(adds[0].entity.prototype).toBe('APCBasic');
    expect(adds[0].entity.position).toEqual({ x: 10.5, y: 20.5 });

    expect(adds[1].entity.uid).toBe(501);
    expect(adds[1].entity.prototype).toBe('GasVentPump');
    expect(adds[1].entity.position).toEqual({ x: 11.5, y: 21.5 });
    expect(adds[1].entity.rotation).toBe(1.5708);
  });

  it('advances nextEntityId correctly', () => {
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'A', rotation: 0, components: [] },
        { dx: 1, dy: 0, prototype: 'B', rotation: 0, components: [] },
        { dx: 0, dy: 1, prototype: 'C', rotation: 0, components: [] },
      ],
    });

    const result = placePrefab({
      prefab,
      placeX: 0,
      placeY: 0,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 42,
    });

    expect(result.nextEntityId).toBe(45);
  });

  it('does not preserve rawYamlLines (positions have changed)', () => {
    const rawLines = ['  - type: Transform', '    pos: 0.5,0.5'];
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'X', rotation: 0, components: [], rawYamlLines: rawLines },
        { dx: 1, dy: 0, prototype: 'Y', rotation: 0, components: [] },
      ],
    });

    const result = placePrefab({
      prefab,
      placeX: 5,
      placeY: 5,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 10,
    });

    // Raw YAML lines contain stale positions from the prefab template,
    // so they must NOT be preserved, exporter will re-serialize from components
    expect(result.rawComponentsMap[10]).toBeUndefined();
    expect(result.rawComponentsMap[11]).toBeUndefined();
  });

  it('removes existing entities within the prefab footprint', () => {
    const existing = [
      makeEntity(1, 'TableFrame', 3, 5),   // inside footprint
      makeEntity(2, 'Chair', 4, 6),         // inside footprint
      makeEntity(3, 'WallSolid', 10, 10),   // outside footprint
      makeEntity(4, 'Light', 2, 5),         // outside (x=2 < placeX=3)
    ];

    const result = placePrefab({
      prefab: makePrefab(),
      placeX: 3,
      placeY: 5,
      grid: makeGrid(20, 20),
      entities: existing,
      nextEntityId: 100,
    });

    const removals = result.command.entityChanges.filter((ec) => ec.action === 'remove');
    expect(removals).toHaveLength(2);
    expect(removals.map((r) => r.entity.uid).sort()).toEqual([1, 2]);
  });

  it('resolves device links from prefab indices to new UIDs', () => {
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'SignalButton', rotation: 0, components: [] },
        { dx: 1, dy: 0, prototype: 'Airlock', rotation: 0, components: [] },
        { dx: 0, dy: 1, prototype: 'BlastDoor', rotation: 0, components: [] },
      ],
      deviceLinks: [
        { sourceIdx: 0, targetIdx: 1, port: 'Pressed', sink: 'Toggle' },
        { sourceIdx: 0, targetIdx: 2, port: 'Pressed', sink: 'Toggle' },
      ],
    });

    const result = placePrefab({
      prefab,
      placeX: 0,
      placeY: 0,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 200,
    });

    expect(result.resolvedDeviceLinks).toHaveLength(2);
    expect(result.resolvedDeviceLinks[0]).toEqual({
      sourceUid: 200, targetUid: 201, port: 'Pressed', sink: 'Toggle',
    });
    expect(result.resolvedDeviceLinks[1]).toEqual({
      sourceUid: 200, targetUid: 202, port: 'Pressed', sink: 'Toggle',
    });
  });

  it('generates a descriptive command label', () => {
    const result = placePrefab({
      prefab: makePrefab({ name: 'Security Post' }),
      placeX: 0,
      placeY: 0,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 1,
    });

    expect(result.command.label).toBe('Place prefab "Security Post"');
  });

  it('preserves spriteStateOverride during placement', () => {
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'AirlockGlass', rotation: 0, components: [], spriteStateOverride: 'open' },
        { dx: 1, dy: 0, prototype: 'APCBasic', rotation: 0, components: [] },
      ],
    });

    const result = placePrefab({
      prefab,
      placeX: 0,
      placeY: 0,
      grid: makeGrid(10, 10),
      entities: [],
      nextEntityId: 50,
    });

    const adds = result.command.entityChanges.filter((ec) => ec.action === 'add');
    expect(adds[0].entity.spriteStateOverride).toBe('open');
    expect(adds[1].entity.spriteStateOverride).toBeUndefined();
  });

  it('handles placement outside grid bounds gracefully', () => {
    const grid = makeGrid(5, 5, 0, 0);
    // Place at negative coordinates, getCell returns null, so before = Space
    const result = placePrefab({
      prefab: makePrefab({
        tiles: [{ dx: 0, dy: 0, tileId: 'FloorSteel' }],
        width: 1,
        height: 1,
      }),
      placeX: -5,
      placeY: -5,
      grid,
      entities: [],
      nextEntityId: 1,
    });

    expect(result.command.tileChanges).toHaveLength(1);
    expect(result.command.tileChanges[0].before.tileId).toBe('Space');
    expect(result.command.tileChanges[0].x).toBe(-5);
  });

  it('clones components so multiple stamps do not share references', () => {
    const sharedComponent = { type: 'Transform', pos: '0.5,0.5' };
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'Window', rotation: 0, components: [sharedComponent] },
      ],
    });

    const grid = makeGrid(20, 20);

    // Stamp 1
    const result1 = placePrefab({
      prefab, placeX: 5, placeY: 5, grid, entities: [], nextEntityId: 1,
    });

    // Stamp 2
    const result2 = placePrefab({
      prefab, placeX: 10, placeY: 10, grid, entities: [], nextEntityId: 100,
    });

    const entity1 = result1.command.entityChanges.find(ec => ec.action === 'add')!.entity;
    const entity2 = result2.command.entityChanges.find(ec => ec.action === 'add')!.entity;

    // Components should be separate objects (not shared references)
    expect(entity1.components[0]).not.toBe(entity2.components[0]);
    expect(entity1.components[0]).not.toBe(sharedComponent);
    expect(entity2.components[0]).not.toBe(sharedComponent);

    // But should have the same content
    expect(entity1.components[0].type).toBe('Transform');
    expect(entity2.components[0].type).toBe('Transform');
  });

  it('places entities at correct distinct positions for each stamp', () => {
    const prefab = makePrefab({
      entities: [
        { dx: 0, dy: 0, prototype: 'Window', rotation: 0, components: [] },
        { dx: 1, dy: 0, prototype: 'Grille', rotation: 0, components: [] },
      ],
    });

    const grid = makeGrid(20, 20);

    const result1 = placePrefab({
      prefab, placeX: 5, placeY: 5, grid, entities: [], nextEntityId: 1,
    });
    const result2 = placePrefab({
      prefab, placeX: 10, placeY: 10, grid, entities: [], nextEntityId: 100,
    });

    const adds1 = result1.command.entityChanges.filter(ec => ec.action === 'add');
    const adds2 = result2.command.entityChanges.filter(ec => ec.action === 'add');

    // First stamp at (5,5)
    expect(adds1[0].entity.position).toEqual({ x: 5.5, y: 5.5 });
    expect(adds1[1].entity.position).toEqual({ x: 6.5, y: 5.5 });

    // Second stamp at (10,10), different positions
    expect(adds2[0].entity.position).toEqual({ x: 10.5, y: 10.5 });
    expect(adds2[1].entity.position).toEqual({ x: 11.5, y: 10.5 });

    // UIDs should not collide
    const allUids = [...adds1, ...adds2].map(ec => ec.entity.uid);
    expect(new Set(allUids).size).toBe(allUids.length);
  });
});
