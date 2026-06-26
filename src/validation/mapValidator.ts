// src/validation/mapValidator.ts
import type { TileGrid } from '../types';
import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { getCell } from '../state/editorState';

export interface ValidationIssue {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  x: number;
  y: number;
  entityUid?: number;
}

interface ValidationRule {
  id: string;
  label: string;
  severity: 'error' | 'warning';
  run(grid: TileGrid, entities: ImportedEntity[], registry: IPrototypeRegistry): ValidationIssue[];
}

// ---- Helper functions ----

/** Get the tags from an entity's Tag component (instance or prototype). */
function getEntityTags(entity: ImportedEntity, registry: IPrototypeRegistry): string[] {
  // Check instance components first
  for (const comp of entity.components) {
    const c = comp as Record<string, unknown>;
    if (c.type === 'Tag' && Array.isArray(c.tags)) return c.tags as string[];
  }
  // Fall back to prototype definition
  const resolved = registry.getEntity(entity.prototype);
  if (resolved) {
    for (const c of resolved.components) {
      if (c.type === 'Tag' && Array.isArray((c as Record<string, unknown>).tags)) {
        return (c as Record<string, unknown>).tags as string[];
      }
    }
  }
  return [];
}

/**
 * Wall prototypes that are allowed to have any tile underneath.
 * Matches AllowedWalls in the game's MapWallFloorTests.cs.
 * These inherit the "Wall" tag but are not structural walls.
 */
const ALLOWED_WALLS = new Set([
  'AsteroidRock',
  'AsteroidRockArtifactFragment',
  'AsteroidRockBananium',
  'AsteroidRockBananiumCrab',
  'AsteroidRockBluespace',
  'AsteroidRockCoal',
  'AsteroidRockCoalCrab',
  'AsteroidRockDiamond',
  'AsteroidRockGibtonite',
  'AsteroidRockGold',
  'AsteroidRockGoldCrab',
  'AsteroidRockTin',
  'AsteroidRockTinCrab',
  'AsteroidRockPlasma',
  'AsteroidRockQuartz',
  'AsteroidRockQuartzCrab',
  'AsteroidRockSalt',
  'AsteroidRockSilver',
  'AsteroidRockSilverCrab',
  'AsteroidRockUranium',
  'AsteroidRockUraniumCrab',
  'AsteroidRockMining',
  'WoodenSupportWall',
  'WoodenSupportWallBroken',
  'SolidSecretDoor',
]);

/**
 * Check if an entity is a wall using the Tag system, matching the game's
 * MapWallFloorTests.cs logic: has "Wall" tag, NOT "Diagonal" tag, NOT in AllowedWalls.
 */
function isWallEntity(entity: ImportedEntity, registry: IPrototypeRegistry): boolean {
  if (ALLOWED_WALLS.has(entity.prototype)) return false;
  const tags = getEntityTags(entity, registry);
  return tags.includes('Wall') && !tags.includes('Diagonal');
}

function isDoorEntity(prototype: string): boolean {
  return prototype.includes('Airlock') || prototype.includes('Firelock');
}

const ALLOWED_WALL_TILES = new Set(['Plating', 'Lattice', 'Space']);

// ---- Rules ----

const floorUnderWallRule: ValidationRule = {
  id: 'floor-under-wall',
  label: 'Floor Tiles Under Walls',
  severity: 'warning',
  run(grid, entities, registry) {
    const issues: ValidationIssue[] = [];
    for (const entity of entities) {
      if (!isWallEntity(entity, registry)) continue;
      const x = Math.floor(entity.position.x);
      const y = Math.floor(entity.position.y);
      const cell = getCell(grid, x, y);
      if (cell && !ALLOWED_WALL_TILES.has(cell.tileId)) {
        issues.push({
          ruleId: 'floor-under-wall', severity: 'warning',
          message: `Floor tile (${cell.tileId}) under wall at (${x}, ${y}). Walls should be on Plating.`,
          x, y, entityUid: entity.uid,
        });
      }
    }
    return issues;
  },
};

const doorWithoutFloorRule: ValidationRule = {
  id: 'door-without-floor',
  label: 'Doors Without Floor Tiles',
  severity: 'warning',
  run(grid, entities) {
    const issues: ValidationIssue[] = [];
    const NO_FLOOR_TILES = new Set(['Space', 'Lattice']);
    for (const entity of entities) {
      if (!isDoorEntity(entity.prototype)) continue;
      const x = Math.floor(entity.position.x);
      const y = Math.floor(entity.position.y);
      const cell = getCell(grid, x, y);
      if (!cell || NO_FLOOR_TILES.has(cell.tileId)) {
        issues.push({
          ruleId: 'door-without-floor', severity: 'warning',
          message: `Door (${entity.prototype}) has no floor tile at (${x}, ${y}).`,
          x, y, entityUid: entity.uid,
        });
      }
    }
    return issues;
  },
};

const danglingDeviceRefRule: ValidationRule = {
  id: 'dangling-device-ref',
  label: 'Dangling Device References',
  severity: 'error',
  run(_grid, entities) {
    const issues: ValidationIssue[] = [];
    const validUids = new Set(entities.map(e => e.uid));

    for (const entity of entities) {
      const x = Math.floor(entity.position.x);
      const y = Math.floor(entity.position.y);
      for (const comp of entity.components) {
        const c = comp as Record<string, unknown>;

        if (c.type === 'DeviceList' && Array.isArray(c.devices)) {
          for (const uid of c.devices as number[]) {
            if (!validUids.has(uid)) {
              issues.push({
                ruleId: 'dangling-device-ref', severity: 'error',
                message: `${entity.prototype} (UID ${entity.uid}) references non-existent entity UID ${uid} in DeviceList.`,
                x, y, entityUid: entity.uid,
              });
            }
          }
        }

        if (c.type === 'DeviceLinkSource' && c.linkedPorts && typeof c.linkedPorts === 'object') {
          for (const uidStr of Object.keys(c.linkedPorts as Record<string, unknown>)) {
            const uid = parseInt(uidStr, 10);
            if (!isNaN(uid) && !validUids.has(uid)) {
              issues.push({
                ruleId: 'dangling-device-ref', severity: 'error',
                message: `${entity.prototype} (UID ${entity.uid}) references non-existent entity UID ${uid} in DeviceLinkSource.`,
                x, y, entityUid: entity.uid,
              });
            }
          }
        }

        if (c.type === 'DeviceNetwork' && Array.isArray(c.deviceLists)) {
          for (const uid of c.deviceLists as number[]) {
            if (!validUids.has(uid)) {
              issues.push({
                ruleId: 'dangling-device-ref', severity: 'error',
                message: `${entity.prototype} (UID ${entity.uid}) references non-existent entity UID ${uid} in DeviceNetwork.`,
                x, y, entityUid: entity.uid,
              });
            }
          }
        }
      }
    }
    return issues;
  },
};

function makeAlarmRule(alarmType: 'AirAlarm' | 'FireAlarm'): ValidationRule {
  const id = alarmType === 'AirAlarm' ? 'unlinked-air-alarm' : 'unlinked-fire-alarm';
  return {
    id,
    label: `Unlinked ${alarmType === 'AirAlarm' ? 'Air' : 'Fire'} Alarms`,
    severity: 'warning',
    run(_grid, entities, registry) {
      const issues: ValidationIssue[] = [];
      for (const entity of entities) {
        if (!entity.prototype.includes(alarmType)) continue;
        const x = Math.floor(entity.position.x);
        const y = Math.floor(entity.position.y);

        // Check instance components
        const instanceDL = entity.components.find(c => (c as Record<string, unknown>).type === 'DeviceList') as Record<string, unknown> | undefined;
        if (instanceDL) {
          const devices = instanceDL.devices;
          if (!Array.isArray(devices) || devices.length === 0) {
            issues.push({
              ruleId: id, severity: 'warning',
              message: `${entity.prototype} at (${x}, ${y}) has no linked devices.`,
              x, y, entityUid: entity.uid,
            });
          }
          continue; // has instance component, checked
        }

        // No instance component, check prototype
        const resolved = registry.getEntity(entity.prototype);
        const hasProtoDL = resolved?.components.some(c => c.type === 'DeviceList') ?? false;
        if (hasProtoDL) {
          // Prototype has DeviceList but instance doesn't, means no devices linked
          issues.push({
            ruleId: id, severity: 'warning',
            message: `${entity.prototype} at (${x}, ${y}) has no linked devices.`,
            x, y, entityUid: entity.uid,
          });
        }
      }
      return issues;
    },
  };
}

// ---- Public API ----

const RULES: ValidationRule[] = [
  floorUnderWallRule,
  doorWithoutFloorRule,
  danglingDeviceRefRule,
  makeAlarmRule('AirAlarm'),
  makeAlarmRule('FireAlarm'),
];

export function validateMap(
  grid: TileGrid,
  entities: ImportedEntity[],
  registry: IPrototypeRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const rule of RULES) {
    issues.push(...rule.run(grid, entities, registry));
  }
  return issues;
}

/** Get rule metadata for UI grouping. */
export function getValidationRules(): { id: string; label: string; severity: 'error' | 'warning' }[] {
  return RULES.map(r => ({ id: r.id, label: r.label, severity: r.severity }));
}
