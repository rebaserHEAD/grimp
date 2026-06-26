/**
 * Shared helper for entity brush operations (paint, rectangle, line, circle).
 * Creates or removes entities at tile positions when the palette item is an entity.
 */

import type { ImportedEntity } from '../import/mapImporter';
import type { EntityChange } from '../types';
import { buildTransformComponent } from './entityHelpers';

/**
 * Create entity-add changes for positions that don't already have the same prototype.
 * Returns the entity changes and the updated next entity ID.
 */
export function createEntitiesAtPositions(
  positions: [number, number][],
  prototypeId: string,
  existingEntities: ImportedEntity[],
  nextEntityId: number,
  gridUid: number = 1,
): { entityChanges: EntityChange[]; nextEntityId: number } {
  const entityChanges: EntityChange[] = [];
  let uid = nextEntityId;

  // Build a set of occupied positions for the same prototype
  const occupied = new Set<string>();
  for (const e of existingEntities) {
    if (e.prototype === prototypeId) {
      occupied.add(`${Math.floor(e.position.x)},${Math.floor(e.position.y)}`);
    }
  }

  const visited = new Set<string>();
  for (const [x, y] of positions) {
    const key = `${x},${y}`;
    if (visited.has(key) || occupied.has(key)) continue;
    visited.add(key);

    const pos = { x: x + 0.5, y: y + 0.5 };
    const entity: ImportedEntity = {
      uid: uid++,
      prototype: prototypeId,
      position: pos,
      rotation: 0,
      components: buildTransformComponent(pos, 0, gridUid),
    };
    entityChanges.push({ action: 'add', entity });
  }

  return { entityChanges, nextEntityId: uid };
}

/**
 * Create entity-remove changes for all entities at the given positions.
 * Optionally filter by prototype (if prototypeId is provided, only remove that type).
 */
export function removeEntitiesAtPositions(
  positions: [number, number][],
  existingEntities: ImportedEntity[],
  prototypeId?: string,
): EntityChange[] {
  const positionSet = new Set<string>();
  for (const [x, y] of positions) {
    positionSet.add(`${x},${y}`);
  }

  const entityChanges: EntityChange[] = [];
  for (const entity of existingEntities) {
    const ex = Math.floor(entity.position.x);
    const ey = Math.floor(entity.position.y);
    if (!positionSet.has(`${ex},${ey}`)) continue;
    if (prototypeId && entity.prototype !== prototypeId) continue;
    entityChanges.push({ action: 'remove', entity });
  }

  return entityChanges;
}
