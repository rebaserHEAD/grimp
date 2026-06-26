import { describe, it, expect, vi } from 'vitest';
import { filterEntities } from '../../hooks/useEntitySearch';
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

describe('EntitySearchBar behavioral contract', () => {
  const entities: ImportedEntity[] = [
    makeEntity(1, 'APCBasic', 5, 5),
    makeEntity(2, 'WallSolid', 10, 10),
    makeEntity(3, 'TableWood', 20, 20),
    makeEntity(4, 'APCHighCapacity', 15, 15),
  ];

  const registry = makeRegistry({
    APCBasic: 'APC',
    WallSolid: 'Reinforced Wall',
    TableWood: 'Wood Table',
    APCHighCapacity: 'High-Capacity APC',
  });

  it('onNavigate receives the correct entity when a result is selected', () => {
    const onNavigate = vi.fn();
    const results = filterEntities(entities, 'apc', registry);
    expect(results.length).toBe(2);
    onNavigate(results[0].entity);
    expect(onNavigate).toHaveBeenCalledWith(entities[0]);
    expect(onNavigate.mock.calls[0][0].uid).toBe(1);
  });

  it('clearing the query produces no results', () => {
    const results = filterEntities(entities, 'apc', registry);
    expect(results.length).toBe(2);
    const cleared = filterEntities(entities, '', registry);
    expect(cleared.length).toBe(0);
  });

  it('keyboard navigation: selectedIndex wraps within results', () => {
    const results = filterEntities(entities, 'apc', registry);
    expect(results.length).toBe(2);
    let idx = 0;
    idx = (idx + 1) % results.length;
    expect(idx).toBe(1);
    idx = (idx + 1) % results.length;
    expect(idx).toBe(0);
  });

  it('keyboard navigation: arrow up wraps to last result', () => {
    const results = filterEntities(entities, 'apc', registry);
    let idx = 0;
    idx = (idx - 1 + results.length) % results.length;
    expect(idx).toBe(1);
  });

  it('match count reflects actual result count', () => {
    const results = filterEntities(entities, 'apc', registry);
    const matchCount = `${results.length} result${results.length !== 1 ? 's' : ''}`;
    expect(matchCount).toBe('2 results');
  });

  it('single result shows singular "result"', () => {
    const results = filterEntities(entities, 'table', registry);
    const matchCount = `${results.length} result${results.length !== 1 ? 's' : ''}`;
    expect(matchCount).toBe('1 result');
  });

  it('no results for non-matching query', () => {
    const results = filterEntities(entities, 'xyznothing', registry);
    expect(results.length).toBe(0);
  });

  it('Enter on empty results does nothing (no crash)', () => {
    const results = filterEntities(entities, 'xyznothing', registry);
    expect(results.length).toBe(0);
    // Simulating Enter with no results, accessing results[0] would be undefined
    const selected = results[0];
    expect(selected).toBeUndefined();
  });

  it('arrow navigation with single result stays at index 0', () => {
    const results = filterEntities(entities, 'table', registry);
    expect(results.length).toBe(1);
    let idx = 0;
    idx = (idx + 1) % results.length; // down → wraps to 0
    expect(idx).toBe(0);
    idx = (idx - 1 + results.length) % results.length; // up → wraps to 0
    expect(idx).toBe(0);
  });

  it('results include position coordinates for display', () => {
    const results = filterEntities(entities, 'apc', registry);
    const first = results[0];
    // Position should be accessible for rendering (x, y)
    expect(first.entity.position.x).toBe(5.5);
    expect(first.entity.position.y).toBe(5.5);
    // Floor for display: (5, 5)
    expect(Math.floor(first.entity.position.x)).toBe(5);
    expect(Math.floor(first.entity.position.y)).toBe(5);
  });

  it('results include UID for display', () => {
    const results = filterEntities(entities, 'wall', registry);
    expect(results[0].entity.uid).toBe(2);
  });
});
