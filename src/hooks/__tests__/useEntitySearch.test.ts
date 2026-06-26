import { describe, it, expect } from 'vitest';
import { filterEntities, type SearchResult } from '../useEntitySearch';
import type { ImportedEntity } from '../../import/mapImporter';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

function makeRegistry(names: Record<string, string>): IPrototypeRegistry {
  return {
    getTile: () => null,
    getEntity: (id: string) => {
      const name = names[id];
      if (!name) return null;
      return {
        id, name, description: '', suffix: '', abstract: false,
        categories: [], placement: {}, components: [], spriteInfo: null,
        sourceCategory: '', raw: { type: 'entity' as const, id },
      };
    },
    getAllTiles: () => [],
    getAllEntities: () => [],
    getEntitiesByCategory: () => [],
    getCategories: () => [],
    getSpriteInfo: () => null,
    tileCount: 0,
    entityCount: 0,
    getDecal: () => null,
    getAllDecals: () => [],
    decalCount: 0,
  };
}

describe('filterEntities', () => {
  const entities: ImportedEntity[] = [
    makeEntity(1, 'APCBasic', 5, 5),
    makeEntity(2, 'APCHighCapacity', 10, 10),
    makeEntity(3, 'WallSolid', 15, 15),
    makeEntity(4, 'TableWood', 20, 20),
    makeEntity(5, 'GasVentPump', 25, 25),
  ];

  const registry = makeRegistry({
    APCBasic: 'APC',
    APCHighCapacity: 'High-Capacity APC',
    WallSolid: 'Reinforced Wall',
    TableWood: 'Wood Table',
    GasVentPump: 'Air Vent',
  });

  it('returns empty array for empty query', () => {
    expect(filterEntities(entities, '', registry)).toEqual([]);
  });

  it('returns empty array for whitespace-only query', () => {
    expect(filterEntities(entities, '   ', registry)).toEqual([]);
  });

  it('matches prototype ID substring (case-insensitive)', () => {
    const results = filterEntities(entities, 'apc', registry);
    expect(results.map(r => r.entity.uid)).toEqual([1, 2]);
  });

  it('matches display name substring (case-insensitive)', () => {
    const results = filterEntities(entities, 'reinforced', registry);
    expect(results.map(r => r.entity.uid)).toEqual([3]);
  });

  it('matches display name even when prototype ID does not match', () => {
    const results = filterEntities(entities, 'air vent', registry);
    expect(results.map(r => r.entity.uid)).toEqual([5]);
  });

  it('returns no results for non-matching query', () => {
    expect(filterEntities(entities, 'xyznonexistent', registry)).toEqual([]);
  });

  it('caps results at 200', () => {
    const manyEntities: ImportedEntity[] = [];
    for (let i = 0; i < 300; i++) {
      manyEntities.push(makeEntity(i + 1, 'WallSolid', i, 0));
    }
    const results = filterEntities(manyEntities, 'wall', registry);
    expect(results.length).toBe(200);
  });

  it('includes displayName and prototypeId in results', () => {
    const results = filterEntities(entities, 'apc', registry);
    expect(results[0].displayName).toBe('APC');
    expect(results[0].prototypeId).toBe('APCBasic');
    expect(results[0].entity.uid).toBe(1);
  });

  it('falls back to prototype ID as display name when not in registry', () => {
    const unknownEntity = makeEntity(99, 'UnknownThing', 0, 0);
    const results = filterEntities([unknownEntity], 'unknown', registry);
    expect(results.length).toBe(1);
    expect(results[0].displayName).toBe('UnknownThing');
  });

  it('handles special regex characters in query without crashing', () => {
    expect(() => filterEntities(entities, 'a(b[c', registry)).not.toThrow();
    expect(filterEntities(entities, 'a(b[c', registry)).toEqual([]);
  });
});
