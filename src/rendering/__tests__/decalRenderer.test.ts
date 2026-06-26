import { describe, it, expect } from 'vitest';
import { sortDecals } from '../decalRenderer';
import type { DecalInstance } from '../../import/decalParser';

function makeDecal(id: number, zIndex: number): DecalInstance {
  return {
    id,
    prototypeId: 'TestDecal',
    position: { x: 0, y: 0 },
    color: null,
    angle: 0,
    zIndex,
    cleanable: false,
  };
}

describe('sortDecals', () => {
  it('sorts by zIndex ascending', () => {
    const decals = [makeDecal(1, 3), makeDecal(2, 1), makeDecal(3, 2)];
    const sorted = sortDecals(decals);
    expect(sorted.map((d) => d.zIndex)).toEqual([1, 2, 3]);
  });

  it('uses instance ID as tiebreaker for same zIndex', () => {
    const decals = [makeDecal(5, 0), makeDecal(2, 0), makeDecal(8, 0)];
    const sorted = sortDecals(decals);
    expect(sorted.map((d) => d.id)).toEqual([2, 5, 8]);
  });

  it('returns empty array for empty input', () => {
    expect(sortDecals([])).toEqual([]);
  });

  it('does not mutate original array', () => {
    const decals = [makeDecal(3, 2), makeDecal(1, 1)];
    const original = [...decals];
    sortDecals(decals);
    expect(decals).toEqual(original);
  });
});
