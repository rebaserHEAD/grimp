import { describe, it, expect } from 'vitest';
import { PrototypeRegistry } from '../prototypeRegistry';
import type { ResolvedTile, ResolvedEntity } from '../registryTypes';

function makeTile(id: string, sprite: string | null = null): ResolvedTile {
  return { id, name: id, sprite, variants: 1, isSubfloor: false, isSpace: false, baseTurf: null, raw: { type: 'tile', id } };
}

function makeEntity(id: string, category: string): ResolvedEntity {
  return {
    id, name: id, description: '', suffix: '', abstract: false,
    categories: [], placement: {}, components: [], spriteInfo: null,
    sourceCategory: category, raw: { type: 'entity', id },
  };
}

describe('PrototypeRegistry', () => {
  it('stores and retrieves tiles', () => {
    const tiles = new Map([['FloorSteel', makeTile('FloorSteel')]]);
    const reg = new PrototypeRegistry(tiles, new Map());
    expect(reg.getTile('FloorSteel')).toBeDefined();
    expect(reg.getTile('NonExistent')).toBeNull();
    expect(reg.tileCount).toBe(1);
  });

  it('stores and retrieves entities', () => {
    const entities = new Map([['APCBasic', makeEntity('APCBasic', 'Structures/Power')]]);
    const reg = new PrototypeRegistry(new Map(), entities);
    expect(reg.getEntity('APCBasic')).toBeDefined();
    expect(reg.entityCount).toBe(1);
  });

  it('groups entities by category', () => {
    const entities = new Map([
      ['APCBasic', makeEntity('APCBasic', 'Structures/Power')],
      ['SMESBasic', makeEntity('SMESBasic', 'Structures/Power')],
      ['Airlock', makeEntity('Airlock', 'Structures/Doors')],
    ]);
    const reg = new PrototypeRegistry(new Map(), entities);
    expect(reg.getCategories()).toContain('Structures/Power');
    expect(reg.getCategories()).toContain('Structures/Doors');
    expect(reg.getEntitiesByCategory('Structures/Power')).toHaveLength(2);
  });

  it('returns all tiles', () => {
    const tiles = new Map([
      ['FloorSteel', makeTile('FloorSteel')],
      ['Plating', makeTile('Plating')],
    ]);
    const reg = new PrototypeRegistry(tiles, new Map());
    expect(reg.getAllTiles()).toHaveLength(2);
  });
});
