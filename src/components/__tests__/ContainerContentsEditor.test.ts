import { describe, it, expect } from 'vitest';
import { hasContainerComponent, getContainedEntityUids, isContainerEntity } from '../ContainerContentsEditor';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';

describe('ContainerContentsEditor helpers', () => {
  it('hasContainerComponent returns true for entities with ContainerContainer', () => {
    const components = [
      { type: 'Transform' },
      { type: 'ContainerContainer', containers: { entity_storage: { ents: [101] } } },
    ];
    expect(hasContainerComponent(components as any)).toBe(true);
  });

  it('hasContainerComponent returns false without ContainerContainer', () => {
    const components = [{ type: 'Transform' }, { type: 'Battery' }];
    expect(hasContainerComponent(components as any)).toBe(false);
  });

  it('getContainedEntityUids extracts UIDs from entity_storage', () => {
    const components = [
      { type: 'ContainerContainer', containers: { entity_storage: { ents: [101, 102] } } },
    ];
    expect(getContainedEntityUids(components as any)).toEqual([101, 102]);
  });

  it('getContainedEntityUids returns empty for missing container', () => {
    const components = [{ type: 'Transform' }];
    expect(getContainedEntityUids(components as any)).toEqual([]);
  });

  it('getContainedEntityUids handles missing ents array', () => {
    const components = [
      { type: 'ContainerContainer', containers: { entity_storage: {} } },
    ];
    expect(getContainedEntityUids(components as any)).toEqual([]);
  });
});

describe('isContainerEntity', () => {
  function makeMockRegistry(protoComponents: { type: string;[key: string]: unknown }[]): IPrototypeRegistry {
    return {
      getEntity: () => ({
        id: 'LockerCaptain', name: 'Captain Locker', description: '', suffix: '',
        abstract: false, categories: [], placement: {}, components: protoComponents,
        spriteInfo: null, sourceCategory: '', raw: { type: 'entity', id: 'LockerCaptain' },
      }),
      getTile: () => null, getAllTiles: () => [], getAllEntities: () => [],
      getEntitiesByCategory: () => [], getCategories: () => [],
      getSpriteInfo: () => null, tileCount: 0, entityCount: 0, getDecal: () => null, getAllDecals: () => [], decalCount: 0,
    };
  }

  it('returns true when entity components have ContainerContainer', () => {
    const entity = {
      uid: 1, prototype: 'LockerCaptain', position: { x: 0, y: 0 }, rotation: 0,
      components: [{ type: 'ContainerContainer' }] as any,
    };
    expect(isContainerEntity(entity, null)).toBe(true);
  });

  it('returns true when prototype defines ContainerContainer', () => {
    const entity = {
      uid: 1, prototype: 'LockerCaptain', position: { x: 0, y: 0 }, rotation: 0,
      components: [{ type: 'Transform' }] as any,
    };
    const registry = makeMockRegistry([{ type: 'ContainerContainer' }]);
    expect(isContainerEntity(entity, registry)).toBe(true);
  });

  it('returns false when neither entity nor prototype has ContainerContainer', () => {
    const entity = {
      uid: 1, prototype: 'APCBasic', position: { x: 0, y: 0 }, rotation: 0,
      components: [{ type: 'Transform' }] as any,
    };
    const registry = makeMockRegistry([{ type: 'Transform' }, { type: 'Battery' }]);
    expect(isContainerEntity(entity, registry)).toBe(false);
  });
});
