/**
 * Shared helper for decal brush operations (paint, rectangle, line, circle, erase).
 * Creates or removes decals at tile positions when the palette item is a decal.
 */

import type { DecalInstance } from '../import/decalParser';
import type { DecalChange } from '../types';

export interface DecalPlacementOptions {
  color: string | null;
  angle: number;
  zIndex: number;
  cleanable: boolean;
  snap: boolean;
}

/**
 * Create decal-add changes for the given positions.
 * Unlike entities, decals can stack, no duplicate checking against existing decals.
 */
export function createDecalsAtPositions(
  positions: [number, number][],
  prototypeId: string,
  existingDecals: DecalInstance[],
  nextDecalId: number,
  options: DecalPlacementOptions,
): { decalChanges: DecalChange[]; nextDecalId: number } {
  const decalChanges: DecalChange[] = [];
  let id = nextDecalId;

  // Deduplicate positions within this placement stroke only.
  // Unlike entities, decals CAN stack, multiple decals (even same prototype)
  // on the same tile is valid in SS14 (layered floor markings, overlapping arrows, etc.)
  const visited = new Set<string>();
  for (const [x, y] of positions) {
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const decal: DecalInstance = {
      id: id++,
      prototypeId,
      position: { x, y },
      color: options.color,
      angle: options.angle,
      zIndex: options.zIndex,
      cleanable: options.cleanable,
    };
    decalChanges.push({ action: 'add', decal });
  }

  return { decalChanges, nextDecalId: id };
}

/**
 * Create decal-remove changes for all decals at the given positions.
 * Optionally filter by prototype.
 */
export function removeDecalsAtPositions(
  positions: [number, number][],
  existingDecals: DecalInstance[],
  prototypeId?: string,
): DecalChange[] {
  const positionSet = new Set<string>();
  for (const [x, y] of positions) {
    positionSet.add(`${x},${y}`);
  }

  const decalChanges: DecalChange[] = [];
  for (const decal of existingDecals) {
    const dx = Math.floor(decal.position.x);
    const dy = Math.floor(decal.position.y);
    if (!positionSet.has(`${dx},${dy}`)) continue;
    if (prototypeId && decal.prototypeId !== prototypeId) continue;
    decalChanges.push({ action: 'remove', decal });
  }

  return decalChanges;
}
