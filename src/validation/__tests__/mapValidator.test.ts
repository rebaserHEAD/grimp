// src/validation/__tests__/mapValidator.test.ts
import { describe, it, expect } from 'vitest';
import { validateMap } from '../mapValidator';
import type { TileGrid } from '../../types';
import type { ImportedEntity } from '../../import/mapImporter';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';

function makeGrid(width: number, height: number, tileId: string = 'Space'): TileGrid {
  return {
    width, height, offsetX: 0, offsetY: 0,
    cells: Array(width * height).fill(null).map(() => ({ tileId })),
  };
}

function makeEntity(uid: number, proto: string, x: number, y: number, components: Record<string, unknown>[] = []): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components };
}

function makeMockRegistry(): IPrototypeRegistry {
  return {
    getTile: () => null,
    getEntity: (id: string) => {
      const components: { type: string;[key: string]: unknown }[] = [];
      // Walls get the Wall tag (matching real SS14 prototype inheritance)
      if (id.includes('Wall') && !id.includes('Diagonal')) {
        components.push({ type: 'Tag', tags: ['Wall'] });
      }
      // Diagonal walls get both Wall and Diagonal tags
      if (id.includes('Diagonal')) {
        components.push({ type: 'Tag', tags: ['Wall', 'Diagonal'] });
      }
      if (id.includes('AirAlarm')) components.push({ type: 'DeviceList' });
      if (id.includes('FireAlarm')) components.push({ type: 'DeviceList' });
      return {
        id, name: id, description: '', suffix: '', abstract: false,
        categories: [], placement: {}, components,
        spriteInfo: null, sourceCategory: 'Other',
        raw: { type: 'entity' as const, id },
      };
    },
    getAllTiles: () => [], getAllEntities: () => [],
    getEntitiesByCategory: () => [], getCategories: () => [],
    getSpriteInfo: () => null, tileCount: 0, entityCount: 0,
    getDecal: () => null, getAllDecals: () => [], decalCount: 0,
  };
}

describe('validateMap', () => {
  describe('floor-under-wall', () => {
    it('flags wall on FloorSteel', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'FloorSteel' };
      const entities = [makeEntity(10, 'WallSolid', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      const wallIssues = issues.filter(i => i.ruleId === 'floor-under-wall');
      expect(wallIssues.length).toBe(1);
      expect(wallIssues[0].severity).toBe('warning');
    });

    it('does not flag wall on Plating', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'Plating' };
      const entities = [makeEntity(10, 'WallSolid', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'floor-under-wall').length).toBe(0);
    });

    it('does not flag wall on Space', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [makeEntity(10, 'WallSolid', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'floor-under-wall').length).toBe(0);
    });

    it('does not flag wall on Lattice', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'Lattice' };
      const entities = [makeEntity(10, 'WallSolid', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'floor-under-wall').length).toBe(0);
    });

    it('does not flag doors as walls', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'FloorSteel' };
      grid.cells[1] = { tileId: 'FloorSteel' };
      const entities = [
        makeEntity(10, 'AirlockCommandLocked', 0, 0),
        makeEntity(11, 'Firelock', 1, 0),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'floor-under-wall').length).toBe(0);
    });

    it('does not flag diagonal walls on floor tiles', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'FloorSteel' };
      // Diagonal walls have both Wall and Diagonal tags, they are allowed on floor tiles
      const entities = [makeEntity(10, 'WallSolidDiagonal', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'floor-under-wall').length).toBe(0);
    });

    it('does not flag allowed wall types (asteroid rocks, etc.)', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'FloorSteel' };
      grid.cells[1] = { tileId: 'FloorSteel' };
      // AsteroidRockMining inherits Wall tag via BaseWall -> BaseStructureWall
      // but is in the AllowedWalls whitelist
      const entities = [
        makeEntity(10, 'AsteroidRockMining', 0, 0),
        makeEntity(11, 'AsteroidRock', 1, 0),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'floor-under-wall').length).toBe(0);
    });
  });

  describe('door-without-floor', () => {
    it('flags airlock on Space', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [makeEntity(10, 'AirlockCommandLocked', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      const doorIssues = issues.filter(i => i.ruleId === 'door-without-floor');
      expect(doorIssues.length).toBe(1);
    });

    it('does not flag airlock on FloorSteel', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'FloorSteel' };
      const entities = [makeEntity(10, 'AirlockCommandLocked', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'door-without-floor').length).toBe(0);
    });

    it('flags firelock on Lattice', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'Lattice' };
      const entities = [makeEntity(10, 'Firelock', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'door-without-floor').length).toBe(1);
    });
  });

  describe('dangling-device-ref', () => {
    it('flags DeviceList with non-existent UID', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'AirAlarm', 0, 0, [{ type: 'DeviceList', devices: [999] }]),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'dangling-device-ref').length).toBe(1);
      expect(issues[0].severity).toBe('error');
    });

    it('does not flag DeviceList with valid UID', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'AirAlarm', 0, 0, [{ type: 'DeviceList', devices: [20] }]),
        makeEntity(20, 'GasVentPump', 1, 0),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'dangling-device-ref').length).toBe(0);
    });

    it('flags DeviceLinkSource with non-existent target', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'SignalButton', 0, 0, [
          { type: 'DeviceLinkSource', linkedPorts: { '888': [['Pressed', 'Toggle']] } },
        ]),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'dangling-device-ref').length).toBe(1);
    });

    it('flags DeviceNetwork with non-existent list', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'GasVentPump', 0, 0, [{ type: 'DeviceNetwork', deviceLists: [777] }]),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'dangling-device-ref').length).toBe(1);
    });
  });

  describe('unlinked-air-alarm', () => {
    it('flags AirAlarm with empty DeviceList', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'AirAlarm', 0, 0, [{ type: 'DeviceList', devices: [] }]),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'unlinked-air-alarm').length).toBe(1);
    });

    it('does not flag AirAlarm with devices', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'AirAlarm', 0, 0, [{ type: 'DeviceList', devices: [20] }]),
        makeEntity(20, 'GasVentPump', 1, 0),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'unlinked-air-alarm').length).toBe(0);
    });

    it('flags AirAlarm with no DeviceList component (prototype-only)', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [makeEntity(10, 'AirAlarm', 0, 0)];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'unlinked-air-alarm').length).toBe(1);
    });
  });

  describe('unlinked-fire-alarm', () => {
    it('flags FireAlarm with empty DeviceList', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'FireAlarm', 0, 0, [{ type: 'DeviceList', devices: [] }]),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'unlinked-fire-alarm').length).toBe(1);
    });

    it('does not flag FireAlarm with devices', () => {
      const grid = makeGrid(16, 16, 'Space');
      const entities = [
        makeEntity(10, 'FireAlarm', 0, 0, [{ type: 'DeviceList', devices: [20] }]),
        makeEntity(20, 'Firelock', 1, 0),
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.filter(i => i.ruleId === 'unlinked-fire-alarm').length).toBe(0);
    });
  });

  describe('integration', () => {
    it('returns multiple issues from different rules', () => {
      const grid = makeGrid(16, 16, 'Space');
      grid.cells[0] = { tileId: 'FloorSteel' }; // wall on floor
      const entities = [
        makeEntity(10, 'WallSolid', 0, 0),
        makeEntity(20, 'AirlockCommandLocked', 1, 0), // door on space
        makeEntity(30, 'AirAlarm', 2, 0, [{ type: 'DeviceList', devices: [999] }]), // dangling + unlinked won't double-count since it has devices
      ];
      const issues = validateMap(grid, entities, makeMockRegistry());
      expect(issues.length).toBeGreaterThanOrEqual(3); // wall, door, dangling
      const ruleIds = new Set(issues.map(i => i.ruleId));
      expect(ruleIds.has('floor-under-wall')).toBe(true);
      expect(ruleIds.has('door-without-floor')).toBe(true);
      expect(ruleIds.has('dangling-device-ref')).toBe(true);
    });
  });
});
