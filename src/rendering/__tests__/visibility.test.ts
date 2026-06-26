import { describe, it, expect } from 'vitest';
import { computeVisibilityPolygon } from '../visibility';
import type { WallSegment } from '../wallSegments';

describe('computeVisibilityPolygon', () => {
  it('returns bounding square when no segments present', () => {
    const poly = computeVisibilityPolygon(5, 5, 3, []);
    // Should be at least 4 vertices forming a square-ish shape
    expect(poly.length).toBeGreaterThanOrEqual(4);
    // All points should be within radius of light center
    for (const p of poly) {
      const dx = p.x - 5;
      const dy = p.y - 5;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(3 + 0.01);
    }
  });

  it('wall segment blocks one side of the light', () => {
    // Light at (5, 5), radius 10
    // Vertical wall segment at x=7 from y=-15 to y=25 (fully blocking east, extends beyond radius)
    const segments: WallSegment[] = [{ x1: 7, y1: -15, x2: 7, y2: 25 }];
    const poly = computeVisibilityPolygon(5, 5, 10, segments);

    // All polygon points should have x <= 7 (blocked by wall)
    for (const p of poly) {
      expect(p.x).toBeLessThanOrEqual(7 + 0.01);
    }
  });

  it('light inside a room sees only the room interior', () => {
    // Box room: walls at x=0, x=10, y=0, y=10
    const segments: WallSegment[] = [
      { x1: 0, y1: 0, x2: 0, y2: 10 },   // left
      { x1: 10, y1: 0, x2: 10, y2: 10 },  // right
      { x1: 0, y1: 0, x2: 10, y2: 0 },    // bottom
      { x1: 0, y1: 10, x2: 10, y2: 10 },  // top
    ];
    const poly = computeVisibilityPolygon(5, 5, 20, segments);

    // All polygon points should be within the room
    for (const p of poly) {
      expect(p.x).toBeGreaterThanOrEqual(-0.01);
      expect(p.x).toBeLessThanOrEqual(10.01);
      expect(p.y).toBeGreaterThanOrEqual(-0.01);
      expect(p.y).toBeLessThanOrEqual(10.01);
    }
  });

  it('returns at least 3 vertices (minimum valid polygon)', () => {
    const poly = computeVisibilityPolygon(0, 0, 5, []);
    expect(poly.length).toBeGreaterThanOrEqual(3);
  });

  it('handles wall segment outside light radius (ignored)', () => {
    const segments: WallSegment[] = [{ x1: 100, y1: 100, x2: 110, y2: 100 }];
    const poly = computeVisibilityPolygon(0, 0, 5, segments);
    // Far-away wall has no effect, all points should still be at radius distance
    for (const p of poly) {
      const dist = Math.sqrt(p.x * p.x + p.y * p.y);
      expect(dist).toBeLessThanOrEqual(5 + 0.01);
      // Most points should be at exactly the radius (no wall intersection)
      expect(dist).toBeGreaterThanOrEqual(4.99);
    }
  });

  it('corner peeking: light sees around wall endpoints', () => {
    // Wall from (3,0) to (3,4), light at (0,5), radius 10
    // Light should see past the wall endpoint at (3,4) into the area beyond
    const segments: WallSegment[] = [{ x1: 3, y1: 0, x2: 3, y2: 4 }];
    const poly = computeVisibilityPolygon(0, 5, 10, segments);

    // Some points should be beyond x=3 (visible above the wall)
    const beyondWall = poly.filter(p => p.x > 3.1);
    expect(beyondWall.length).toBeGreaterThan(0);
  });

  it('regression: many overlapping corridor segments produce bounded polygon', () => {
    // 50 wall segments forming a dense corridor pattern around the light
    // Two parallel walls (top and bottom) each made of 25 short segments
    const segments: WallSegment[] = [];
    for (let i = 0; i < 25; i++) {
      // Bottom wall segments at y=2, from x=i to x=i+1
      segments.push({ x1: i, y1: 2, x2: i + 1, y2: 2 });
      // Top wall segments at y=8, from x=i to x=i+1
      segments.push({ x1: i, y1: 8, x2: i + 1, y2: 8 });
    }

    // Light at center of corridor
    const poly = computeVisibilityPolygon(12, 5, 20, segments);

    // All polygon points should be bounded by the corridor walls vertically
    for (const p of poly) {
      // Points within the corridor x-range should be bounded by y=[2,8]
      if (p.x >= 0 && p.x <= 25) {
        expect(p.y).toBeGreaterThanOrEqual(2 - 0.01);
        expect(p.y).toBeLessThanOrEqual(8 + 0.01);
      }
    }

    // Polygon should have a reasonable number of vertices
    expect(poly.length).toBeGreaterThanOrEqual(16);

    // All points within radius
    for (const p of poly) {
      const dx = p.x - 12;
      const dy = p.y - 5;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(20 + 0.01);
    }
  });
});
