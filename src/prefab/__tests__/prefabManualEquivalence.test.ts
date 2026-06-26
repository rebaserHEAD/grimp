/**
 * Prefab placement must produce the exact same result as manual tool placement.
 * A prefab stamp is a convenience, it should never produce entities or tiles
 * that differ from what the paint/entityPlace tools would create.
 */
import { describe, it, expect } from 'vitest';
import { placePrefab } from '../prefabPlacer';
import { serializePrefab } from '../prefabSerializer';
import type { PrefabData } from '../prefabTypes';
import type { TileGrid, TileCell } from '../../types';
import type { ImportedEntity } from '../../import/mapImporter';
import { buildTransformComponent } from '../../tools/entityHelpers';
import { getCell, setCell } from '../../state/editorState';

function makeGrid(w: number, h: number): TileGrid {
  const cells = new Array(w * h);
  for (let i = 0; i < cells.length; i++) cells[i] = { tileId: 'Space' };
  return { width: w, height: h, offsetX: 0, offsetY: 0, cells };
}

function makeEntity(uid: number, proto: string, x: number, y: number, rot = 0): ImportedEntity {
  const pos = { x: x + 0.5, y: y + 0.5 };
  return {
    uid, prototype: proto, position: pos, rotation: rot,
    components: buildTransformComponent(pos, rot, 1),
  };
}

describe('prefab placement equivalence with manual tools', () => {
  it('entity Transform pos matches what buildTransformComponent produces', () => {
    // Manually place entities at specific positions
    const manualEntities = [
      makeEntity(1, 'Grille', 3, 5),
      makeEntity(2, 'ReinforcedWindow', 3, 5),
      makeEntity(3, 'Grille', 4, 5),
      makeEntity(4, 'ReinforcedWindow', 4, 5),
    ];

    // Create a grid with tiles
    const grid = makeGrid(10, 10);
    setCell(grid, 3, 5, { tileId: 'FloorSteel' });
    setCell(grid, 4, 5, { tileId: 'FloorSteel' });

    // Serialize to prefab
    const prefab = serializePrefab({
      name: 'test',
      minX: 3, minY: 5, maxX: 4, maxY: 5,
      grid,
      entities: manualEntities,
      entityRawComponents: {},
    });

    // Place the prefab at a different location
    const placeX = 10;
    const placeY = 20;
    const result = placePrefab({
      prefab,
      placeX, placeY,
      grid: makeGrid(30, 30),
      entities: [],
      nextEntityId: 100,
    });

    const adds = result.command.entityChanges.filter(ec => ec.action === 'add');

    for (const ec of adds) {
      const entity = ec.entity;
      const transform = entity.components.find((c: any) => c.type === 'Transform') as any;

      // The Transform pos must match the entity's position
      expect(transform).toBeDefined();
      expect(transform.pos).toBe(`${entity.position.x},${entity.position.y}`);

      // Compare against what buildTransformComponent would produce
      const expected = buildTransformComponent(entity.position, entity.rotation, 1);
      const expectedTransform = expected.find((c: any) => c.type === 'Transform') as any;
      expect(transform.pos).toBe(expectedTransform.pos);

      // Rotation should match too
      if (entity.rotation !== 0) {
        expect(transform.rot).toBe(expectedTransform.rot);
      } else {
        expect(transform.rot).toBeUndefined();
      }
    }
  });

  it('entities have unique component references (no shared objects)', () => {
    const grid = makeGrid(10, 10);
    setCell(grid, 0, 0, { tileId: 'FloorSteel' });
    setCell(grid, 1, 0, { tileId: 'FloorSteel' });

    const entities = [
      makeEntity(1, 'Window', 0, 0),
      makeEntity(2, 'Window', 1, 0),
    ];

    const prefab = serializePrefab({
      name: 'test', minX: 0, minY: 0, maxX: 1, maxY: 0,
      grid, entities, entityRawComponents: {},
    });

    // Stamp twice at different locations
    const result1 = placePrefab({
      prefab, placeX: 5, placeY: 5,
      grid: makeGrid(20, 20), entities: [], nextEntityId: 100,
    });
    const result2 = placePrefab({
      prefab, placeX: 10, placeY: 10,
      grid: makeGrid(20, 20), entities: [], nextEntityId: 200,
    });

    const adds1 = result1.command.entityChanges.filter(ec => ec.action === 'add');
    const adds2 = result2.command.entityChanges.filter(ec => ec.action === 'add');

    // Components from stamp 1 and stamp 2 must be independent objects
    for (let i = 0; i < adds1.length; i++) {
      for (let j = 0; j < adds1[i].entity.components.length; j++) {
        expect(adds1[i].entity.components[j]).not.toBe(adds2[i].entity.components[j]);
      }
    }

    // Components within the same stamp must also be independent
    expect(adds1[0].entity.components[0]).not.toBe(adds1[1].entity.components[0]);
  });

  it('entity positions differ between stamps at different locations', () => {
    const grid = makeGrid(10, 10);
    setCell(grid, 0, 0, { tileId: 'FloorSteel' });

    const entities = [makeEntity(1, 'Window', 0, 0)];

    const prefab = serializePrefab({
      name: 'test', minX: 0, minY: 0, maxX: 0, maxY: 0,
      grid, entities, entityRawComponents: {},
    });

    // Stamp at two different locations
    const r1 = placePrefab({ prefab, placeX: 5, placeY: 5, grid: makeGrid(20, 20), entities: [], nextEntityId: 1 });
    const r2 = placePrefab({ prefab, placeX: 15, placeY: 25, grid: makeGrid(30, 30), entities: [], nextEntityId: 1 });

    const e1 = r1.command.entityChanges.find(ec => ec.action === 'add')!.entity;
    const e2 = r2.command.entityChanges.find(ec => ec.action === 'add')!.entity;

    // Positions must differ
    expect(e1.position).not.toEqual(e2.position);
    expect(e1.position).toEqual({ x: 5.5, y: 5.5 });
    expect(e2.position).toEqual({ x: 15.5, y: 25.5 });

    // Transform component pos must match respective entity positions
    const t1 = e1.components.find((c: any) => c.type === 'Transform') as any;
    const t2 = e2.components.find((c: any) => c.type === 'Transform') as any;
    expect(t1.pos).toBe('5.5,5.5');
    expect(t2.pos).toBe('15.5,25.5');
  });

  it('tile changes use correct world coordinates', () => {
    const grid = makeGrid(10, 10);
    setCell(grid, 2, 3, { tileId: 'FloorSteel' });
    setCell(grid, 3, 3, { tileId: 'Plating' });

    const prefab = serializePrefab({
      name: 'test', minX: 2, minY: 3, maxX: 3, maxY: 3,
      grid, entities: [], entityRawComponents: {},
    });

    // Place at offset (10, 20)
    const result = placePrefab({
      prefab, placeX: 10, placeY: 20,
      grid: makeGrid(30, 30), entities: [], nextEntityId: 1,
    });

    const tileChanges = result.command.tileChanges;
    expect(tileChanges).toHaveLength(2);

    const steel = tileChanges.find(tc => tc.after.tileId === 'FloorSteel')!;
    expect(steel.x).toBe(10); // placeX + dx(0)
    expect(steel.y).toBe(20); // placeY + dy(0)

    const plating = tileChanges.find(tc => tc.after.tileId === 'Plating')!;
    expect(plating.x).toBe(11); // placeX + dx(1)
    expect(plating.y).toBe(20); // placeY + dy(0)
  });

  it('rotated entities have correct Transform rot field', () => {
    const grid = makeGrid(10, 10);
    setCell(grid, 0, 0, { tileId: 'FloorSteel' });

    const rot = Math.PI / 2;
    const entities = [makeEntity(1, 'APC', 0, 0, rot)];

    const prefab = serializePrefab({
      name: 'test', minX: 0, minY: 0, maxX: 0, maxY: 0,
      grid, entities, entityRawComponents: {},
    });

    const result = placePrefab({
      prefab, placeX: 8, placeY: 8,
      grid: makeGrid(20, 20), entities: [], nextEntityId: 1,
    });

    const entity = result.command.entityChanges.find(ec => ec.action === 'add')!.entity;
    const transform = entity.components.find((c: any) => c.type === 'Transform') as any;

    expect(entity.rotation).toBe(rot);
    expect(transform.rot).toBe(`${rot} rad`);
    expect(transform.pos).toBe('8.5,8.5');
  });

  it('raw YAML lines are never preserved (positions changed from template)', () => {
    const grid = makeGrid(10, 10);
    setCell(grid, 0, 0, { tileId: 'FloorSteel' });

    const entities: ImportedEntity[] = [{
      uid: 1, prototype: 'Window',
      position: { x: 0.5, y: 0.5 }, rotation: 0,
      components: [{ type: 'Transform', pos: '0.5,0.5', parent: 1 }],
    }];

    const prefab = serializePrefab({
      name: 'test', minX: 0, minY: 0, maxX: 0, maxY: 0,
      grid, entities,
      entityRawComponents: { 1: ['  - type: Transform', '    pos: 0.5,0.5', '    parent: 1'] },
    });

    // rawYamlLines should be stored in the prefab
    expect(prefab.entities[0].rawYamlLines).toBeDefined();

    // But after placement at a new location, rawComponentsMap must be empty
    const result = placePrefab({
      prefab, placeX: 10, placeY: 10,
      grid: makeGrid(20, 20), entities: [], nextEntityId: 1,
    });

    expect(Object.keys(result.rawComponentsMap)).toHaveLength(0);
  });
});
