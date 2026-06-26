import type { ImportedEntity } from '../import/mapImporter';

/**
 * Spatial index for O(1) tile-based entity lookups.
 *
 * Maintained incrementally by the reducer on entity mutations.
 * Replaces the per-frame O(N) cable/smooth index rebuilds and O(N) hover scans.
 */

const cells = new Map<number, ImportedEntity[]>();
const uidToKey = new Map<number, number>();
const uidToEntity = new Map<number, ImportedEntity>();

/**
 * Generation counter, incremented on every mutation (insert, remove, rebuild).
 * Used by the entity renderer to detect spatial index changes independently
 * of React's state update timing.
 */
let generation = 0;

/** Get the current spatial index generation. */
export function spatialGeneration(): number {
  return generation;
}

/** Numeric tile key: packs floored x,y into a single 32-bit number. Valid for [-32768, 32767]. */
export function tileKey(x: number, y: number): number {
  const ix = Math.floor(x) & 0xFFFF;
  const iy = Math.floor(y) & 0xFFFF;
  return (ix << 16) | iy;
}

/** Full rebuild from entity array (map load, new map). */
export function rebuildSpatialIndex(entities: ImportedEntity[]): void {
  cells.clear();
  uidToKey.clear();
  uidToEntity.clear();
  generation++;
  for (const e of entities) {
    const key = tileKey(e.position.x, e.position.y);
    uidToKey.set(e.uid, key);
    uidToEntity.set(e.uid, e);
    const list = cells.get(key);
    if (list) list.push(e);
    else cells.set(key, [e]);
  }
}

/** Insert a single entity. O(1). */
export function spatialInsert(entity: ImportedEntity): void {
  generation++;
  const key = tileKey(entity.position.x, entity.position.y);
  uidToKey.set(entity.uid, key);
  uidToEntity.set(entity.uid, entity);
  const list = cells.get(key);
  if (list) list.push(entity);
  else cells.set(key, [entity]);
}

/** Remove a single entity by UID. O(cell size). */
export function spatialRemove(uid: number): void {
  generation++;
  const key = uidToKey.get(uid);
  if (key === undefined) return;
  uidToKey.delete(uid);
  uidToEntity.delete(uid);
  const list = cells.get(key);
  if (!list) return;
  const idx = list.findIndex(e => e.uid === uid);
  if (idx >= 0) {
    list.splice(idx, 1);
    if (list.length === 0) cells.delete(key);
  }
}

/** Get all entities at a world tile position. O(1). */
export function spatialGetAt(worldX: number, worldY: number): ImportedEntity[] {
  return cells.get(tileKey(worldX, worldY)) ?? [];
}

/** Get all entities in a world-coordinate rectangle (inclusive). O(area). */
export function spatialGetInRect(
  minX: number, minY: number,
  maxX: number, maxY: number,
): ImportedEntity[] {
  const result: ImportedEntity[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const list = cells.get(tileKey(x, y));
      if (list) {
        for (const e of list) result.push(e);
      }
    }
  }
  return result;
}

/** Clear the index entirely. */
export function clearSpatialIndex(): void {
  cells.clear();
  uidToKey.clear();
  uidToEntity.clear();
}

/** Look up an entity by UID. O(1). */
export function spatialGetByUid(uid: number): ImportedEntity | undefined {
  return uidToEntity.get(uid);
}

/** Number of indexed entities (for testing). */
export function spatialSize(): number {
  return uidToKey.size;
}

/**
 * Debug: verify spatial index matches entity array.
 * Checks both uidToKey and actual cell contents.
 * Logs warnings if there's a mismatch.
 */
export function spatialDebugVerify(entities: ImportedEntity[]): void {
  const entityUids = new Set(entities.map(e => e.uid));
  const indexUids = new Set(uidToKey.keys());

  // Check uidToKey vs entity array
  for (const uid of entityUids) {
    if (!indexUids.has(uid)) {
      console.warn(`[SpatialIndex] Entity uid=${uid} in array but NOT in uidToKey`);
    }
  }
  for (const uid of indexUids) {
    if (!entityUids.has(uid)) {
      console.warn(`[SpatialIndex] Entity uid=${uid} in uidToKey but NOT in entity array`);
    }
  }

  // Check cell contents for orphaned entries (entities in cells but not in uidToKey)
  let cellEntityCount = 0;
  for (const [key, list] of cells) {
    for (const e of list) {
      cellEntityCount++;
      if (!indexUids.has(e.uid)) {
        console.warn(`[SpatialIndex] ORPHAN: Entity uid=${e.uid} proto=${e.prototype} in cell ${key} but NOT in uidToKey`);
      }
      if (!entityUids.has(e.uid)) {
        console.warn(`[SpatialIndex] ORPHAN: Entity uid=${e.uid} proto=${e.prototype} in cell ${key} but NOT in entity array`);
      }
    }
  }
  if (cellEntityCount !== indexUids.size) {
    console.warn(`[SpatialIndex] COUNT MISMATCH: ${cellEntityCount} entities in cells vs ${indexUids.size} in uidToKey`);
  }
}
