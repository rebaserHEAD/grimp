import { describe, it, expect, beforeEach } from 'vitest';
import {
  rebuildSpatialIndex, spatialInsert, spatialRemove,
  spatialGetAt, spatialGetInRect, clearSpatialIndex, spatialSize,
  spatialGetByUid,
} from '../spatialIndex';
import type { ImportedEntity } from '../../import/mapImporter';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

describe('SpatialIndex', () => {
  beforeEach(() => {
    clearSpatialIndex();
  });

  it('starts empty', () => {
    expect(spatialSize()).toBe(0);
    expect(spatialGetAt(0, 0)).toEqual([]);
  });

  it('rebuild populates index from entity array', () => {
    const entities = [
      makeEntity(1, 'Wall', 5, 5),
      makeEntity(2, 'APC', 5, 5),
      makeEntity(3, 'Table', 10, 10),
    ];
    rebuildSpatialIndex(entities);

    expect(spatialSize()).toBe(3);
    expect(spatialGetAt(5, 5)).toHaveLength(2);
    expect(spatialGetAt(10, 10)).toHaveLength(1);
    expect(spatialGetAt(0, 0)).toHaveLength(0);
  });

  it('insert adds entity to correct cell', () => {
    const e = makeEntity(1, 'Wall', 3, 4);
    spatialInsert(e);

    expect(spatialSize()).toBe(1);
    expect(spatialGetAt(3, 4)).toEqual([e]);
  });

  it('remove takes entity out of cell', () => {
    const e1 = makeEntity(1, 'Wall', 3, 4);
    const e2 = makeEntity(2, 'APC', 3, 4);
    spatialInsert(e1);
    spatialInsert(e2);

    spatialRemove(1);
    expect(spatialSize()).toBe(1);
    expect(spatialGetAt(3, 4)).toEqual([e2]);
  });

  it('remove of last entity in cell cleans up cell', () => {
    const e = makeEntity(1, 'Wall', 3, 4);
    spatialInsert(e);
    spatialRemove(1);

    expect(spatialSize()).toBe(0);
    expect(spatialGetAt(3, 4)).toEqual([]);
  });

  it('remove of nonexistent uid is a no-op', () => {
    spatialRemove(999);
    expect(spatialSize()).toBe(0);
  });

  it('getInRect returns entities within bounds', () => {
    rebuildSpatialIndex([
      makeEntity(1, 'Wall', 0, 0),
      makeEntity(2, 'APC', 2, 2),
      makeEntity(3, 'Table', 5, 5),
      makeEntity(4, 'Chair', 10, 10),
    ]);

    const result = spatialGetInRect(0, 0, 5, 5);
    const uids = result.map(e => e.uid).sort();
    expect(uids).toEqual([1, 2, 3]);
  });

  it('getInRect with single cell returns only that cell', () => {
    rebuildSpatialIndex([
      makeEntity(1, 'Wall', 3, 3),
      makeEntity(2, 'APC', 3, 4),
    ]);

    const result = spatialGetInRect(3, 3, 3, 3);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe(1);
  });

  it('rebuild clears previous data', () => {
    spatialInsert(makeEntity(1, 'Wall', 0, 0));
    rebuildSpatialIndex([makeEntity(2, 'APC', 5, 5)]);

    expect(spatialSize()).toBe(1);
    expect(spatialGetAt(0, 0)).toHaveLength(0);
    expect(spatialGetAt(5, 5)).toHaveLength(1);
  });

  it('handles entities at negative coordinates', () => {
    const e = makeEntity(1, 'Wall', -5, -3);
    spatialInsert(e);

    expect(spatialGetAt(-5, -3)).toEqual([e]);
  });

  it('incremental insert+remove matches rebuild', () => {
    const e1 = makeEntity(1, 'Wall', 1, 1);
    const e2 = makeEntity(2, 'APC', 2, 2);
    const e3 = makeEntity(3, 'Table', 3, 3);

    // Build incrementally
    spatialInsert(e1);
    spatialInsert(e2);
    spatialInsert(e3);
    spatialRemove(2);

    const atOne = spatialGetAt(1, 1);
    const atTwo = spatialGetAt(2, 2);
    const atThree = spatialGetAt(3, 3);

    // Compare with rebuild
    rebuildSpatialIndex([e1, e3]);

    expect(spatialGetAt(1, 1)).toEqual(atOne);
    expect(spatialGetAt(2, 2)).toEqual(atTwo);
    expect(spatialGetAt(3, 3)).toEqual(atThree);
  });

  describe('numeric key encoding', () => {
    it('handles coordinates at encoding boundary (-32768 to 32767)', () => {
      const e1 = makeEntity(1, 'Wall', -32768, -32768);
      const e2 = makeEntity(2, 'Wall', 32767, 32767);
      spatialInsert(e1);
      spatialInsert(e2);
      expect(spatialGetAt(-32768, -32768)).toEqual([e1]);
      expect(spatialGetAt(32767, 32767)).toEqual([e2]);
      expect(spatialSize()).toBe(2);
    });

    it('does not collide keys for adjacent coordinates', () => {
      const e1 = makeEntity(1, 'A', 0, 1);
      const e2 = makeEntity(2, 'B', 1, 0);
      spatialInsert(e1);
      spatialInsert(e2);
      expect(spatialGetAt(0, 1)).toEqual([e1]);
      expect(spatialGetAt(1, 0)).toEqual([e2]);
    });

    it('handles wrapping coordinates near 16-bit boundary', () => {
      const e1 = makeEntity(1, 'A', 32767, 0);
      const e2 = makeEntity(2, 'B', -32768, 0);
      spatialInsert(e1);
      spatialInsert(e2);
      expect(spatialGetAt(32767, 0)).toEqual([e1]);
      expect(spatialGetAt(-32768, 0)).toEqual([e2]);
    });
  });

  describe('spatialGetByUid', () => {
    it('returns entity directly by UID after rebuild', () => {
      const e1 = makeEntity(1, 'Wall', 5, 5);
      const e2 = makeEntity(2, 'APC', 10, 10);
      rebuildSpatialIndex([e1, e2]);

      expect(spatialGetByUid(1)).toBe(e1);
      expect(spatialGetByUid(2)).toBe(e2);
    });

    it('returns entity directly by UID after insert', () => {
      const e = makeEntity(42, 'Table', 3, 4);
      spatialInsert(e);

      expect(spatialGetByUid(42)).toBe(e);
    });

    it('returns undefined for unknown UID', () => {
      rebuildSpatialIndex([makeEntity(1, 'Wall', 0, 0)]);
      expect(spatialGetByUid(999)).toBeUndefined();
    });

    it('returns undefined after entity is removed', () => {
      const e = makeEntity(1, 'Wall', 0, 0);
      spatialInsert(e);
      spatialRemove(1);

      expect(spatialGetByUid(1)).toBeUndefined();
    });

    it('handles multiple entities at same tile, both findable by UID', () => {
      const e1 = makeEntity(10, 'Wall', 5, 5);
      const e2 = makeEntity(20, 'APC', 5, 5);
      const e3 = makeEntity(30, 'Table', 5, 5);
      rebuildSpatialIndex([e1, e2, e3]);

      expect(spatialGetByUid(10)).toBe(e1);
      expect(spatialGetByUid(20)).toBe(e2);
      expect(spatialGetByUid(30)).toBe(e3);
    });

    it('returns undefined after clearSpatialIndex', () => {
      spatialInsert(makeEntity(1, 'Wall', 0, 0));
      clearSpatialIndex();

      expect(spatialGetByUid(1)).toBeUndefined();
    });
  });
});
