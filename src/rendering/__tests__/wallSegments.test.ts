import { describe, it, expect } from 'vitest';
import { buildWallSegmentCache, excludeTileEdges, WallSegment } from '../wallSegments';
import type { ImportedEntity } from '../../import/mapImporter';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';

function makeWallEntity(uid: number, x: number, y: number): ImportedEntity {
  return { uid, prototype: 'WallSolid', position: { x, y }, rotation: 0, components: [] };
}

function makeNonWallEntity(uid: number, x: number, y: number): ImportedEntity {
  return { uid, prototype: 'PoweredLight', position: { x, y }, rotation: 0, components: [] };
}

// Registry where WallSolid has Occluder component, PoweredLight does not
function makeRegistry(): IPrototypeRegistry {
  return {
    getEntity: (id: string) => {
      if (id === 'WallSolid') {
        return {
          id: 'WallSolid', name: 'Wall', description: '', suffix: '',
          abstract: false, categories: [], placement: {},
          components: [{ type: 'Occluder' }, { type: 'Transform' }],
          spriteInfo: null, sourceCategory: '', raw: { type: 'entity' as const, id: 'WallSolid' },
        };
      }
      return {
        id, name: id, description: '', suffix: '',
        abstract: false, categories: [], placement: {},
        components: [{ type: 'Transform' }],
        spriteInfo: null, sourceCategory: '', raw: { type: 'entity' as const, id },
      };
    },
    getTile: () => null, getAllTiles: () => [], getAllEntities: () => [],
    getEntitiesByCategory: () => [], getCategories: () => [],
    getSpriteInfo: () => null, tileCount: 0, entityCount: 0, getDecal: () => null, getAllDecals: () => [], decalCount: 0,
  };
}

describe('buildWallSegmentCache', () => {
  it('returns empty for no entities', () => {
    const cache = buildWallSegmentCache([], makeRegistry());
    expect(cache.segments).toHaveLength(0);
  });

  it('returns empty when no entities have Occluder', () => {
    const entities = [makeNonWallEntity(1, 5, 5)];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    expect(cache.segments).toHaveLength(0);
  });

  it('single wall tile produces 4 exposed edges', () => {
    const entities = [makeWallEntity(1, 5, 5)];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    expect(cache.segments).toHaveLength(4);
  });

  it('two adjacent walls share edge, merged to 4 segments', () => {
    // Walls at (5,5) and (6,5): shared vertical edge is removed,
    // top/bottom colinear edges merge → 4 total segments
    const entities = [makeWallEntity(1, 5, 5), makeWallEntity(2, 6, 5)];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    expect(cache.segments).toHaveLength(4);
  });

  it('2x2 wall block has 4 merged segments', () => {
    // Each side of the 2x2 square merges into one segment
    const entities = [
      makeWallEntity(1, 0, 0), makeWallEntity(2, 1, 0),
      makeWallEntity(3, 0, 1), makeWallEntity(4, 1, 1),
    ];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    expect(cache.segments).toHaveLength(4);
  });

  it('merges colinear edges into longer segments', () => {
    // Row of 3 walls: top edge should merge into 1 segment, bottom into 1
    const entities = [
      makeWallEntity(1, 0, 0), makeWallEntity(2, 1, 0), makeWallEntity(3, 2, 0),
    ];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    // Top: 1 merged, Bottom: 1 merged, Left: 1, Right: 1 = 4 total
    expect(cache.segments).toHaveLength(4);
  });

  it('getSegmentsInRadius returns only nearby segments', () => {
    const entities = [makeWallEntity(1, 0, 0), makeWallEntity(2, 100, 100)];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    const nearby = cache.getSegmentsInRadius(0.5, 0.5, 5);
    // Only segments from wall at (0,0), not (100,100)
    expect(nearby.length).toBe(4);
  });

  it('getSegmentsInRadius excludes far-away segments via spatial buckets', () => {
    // Place walls at two distant clusters
    const entities = [
      makeWallEntity(1, 0, 0),
      makeWallEntity(2, 1, 0),
      makeWallEntity(3, 50, 50),
      makeWallEntity(4, 51, 50),
    ];
    const cache = buildWallSegmentCache(entities, makeRegistry());
    // Query near origin, should only get segments from (0,0)/(1,0) cluster
    const nearOrigin = cache.getSegmentsInRadius(1, 0.5, 3);
    for (const seg of nearOrigin) {
      // All segment coordinates should be near origin, not near (50,50)
      expect(Math.min(seg.x1, seg.x2)).toBeLessThan(10);
      expect(Math.min(seg.y1, seg.y2)).toBeLessThan(10);
    }
    // Query near distant cluster, should only get segments from (50,50)/(51,50) cluster
    const nearFar = cache.getSegmentsInRadius(50.5, 50.5, 3);
    for (const seg of nearFar) {
      expect(Math.max(seg.x1, seg.x2)).toBeGreaterThan(40);
      expect(Math.max(seg.y1, seg.y2)).toBeGreaterThan(40);
    }
  });

  it('getSegmentsInRadius returns long segments that cross through query radius', () => {
    // Create a long row of walls from x=0..19 at y=10
    const entities: ImportedEntity[] = [];
    for (let x = 0; x < 20; x++) {
      entities.push(makeWallEntity(x + 1, x, 10));
    }
    const cache = buildWallSegmentCache(entities, makeRegistry());
    // The top/bottom edges merge into a single segment spanning x=0..20
    // Query at x=10, y=10.5 with small radius, the long merged segment should still be found
    const nearby = cache.getSegmentsInRadius(10, 10.5, 2);
    // Should include the long merged top edge (y=11, x=0..20) because it crosses through
    const topEdge = nearby.find(s => s.y1 === 11 && s.y2 === 11);
    expect(topEdge).toBeDefined();
    expect(topEdge!.x1).toBe(0);
    expect(topEdge!.x2).toBe(20);
  });
});

describe('excludeTileEdges', () => {
  it('removes all 4 edges of a single-tile wall', () => {
    // Single wall at (5,5) produces 4 segments: bottom, top, left, right
    const segments: WallSegment[] = [
      { x1: 5, y1: 5, x2: 6, y2: 5 },   // bottom
      { x1: 5, y1: 6, x2: 6, y2: 6 },   // top
      { x1: 5, y1: 5, x2: 5, y2: 6 },   // left
      { x1: 6, y1: 5, x2: 6, y2: 6 },   // right
    ];
    const filtered = excludeTileEdges(segments, 5, 5);
    expect(filtered).toHaveLength(0);
  });

  it('splits a merged horizontal segment around the excluded tile', () => {
    // Long merged segment at y=5 from x=3 to x=8
    // Exclude tile at (5,5), its bottom edge is y=5, x=5 to x=6
    const segments: WallSegment[] = [
      { x1: 3, y1: 5, x2: 8, y2: 5 },
    ];
    const filtered = excludeTileEdges(segments, 5, 5);
    // Should split into (3,5)→(5,5) and (6,5)→(8,5)
    expect(filtered).toHaveLength(2);
    expect(filtered).toContainEqual({ x1: 3, y1: 5, x2: 5, y2: 5 });
    expect(filtered).toContainEqual({ x1: 6, y1: 5, x2: 8, y2: 5 });
  });

  it('splits a merged vertical segment around the excluded tile', () => {
    // Vertical segment at x=5 from y=2 to y=9
    // Exclude tile at (5,5), left edge is x=5, y=5 to y=6
    const segments: WallSegment[] = [
      { x1: 5, y1: 2, x2: 5, y2: 9 },
    ];
    const filtered = excludeTileEdges(segments, 5, 5);
    expect(filtered).toHaveLength(2);
    expect(filtered).toContainEqual({ x1: 5, y1: 2, x2: 5, y2: 5 });
    expect(filtered).toContainEqual({ x1: 5, y1: 6, x2: 5, y2: 9 });
  });

  it('keeps segments not on the excluded tile edges', () => {
    const segments: WallSegment[] = [
      { x1: 0, y1: 0, x2: 3, y2: 0 },   // far away horizontal
      { x1: 10, y1: 0, x2: 10, y2: 5 },  // far away vertical
    ];
    const filtered = excludeTileEdges(segments, 5, 5);
    expect(filtered).toHaveLength(2);
  });

  it('handles segment ending at tile edge (left part only)', () => {
    // Segment from x=3 to x=6 at y=5, tile at (5,5)
    // Bottom edge overlap: x=5 to x=6, left remainder: x=3 to x=5
    const segments: WallSegment[] = [
      { x1: 3, y1: 5, x2: 6, y2: 5 },
    ];
    const filtered = excludeTileEdges(segments, 5, 5);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual({ x1: 3, y1: 5, x2: 5, y2: 5 });
  });
});
