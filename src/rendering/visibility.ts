import type { WallSegment } from './wallSegments';

export interface Point {
  x: number;
  y: number;
}

/** Small angular offset for corner peeking rays. */
const EPSILON = 0.0001;

/**
 * Compute the visibility polygon for a point light using angular sweep raycasting.
 *
 * @param lx - Light x position (world coordinates)
 * @param ly - Light y position (world coordinates)
 * @param radius - Light radius (world units)
 * @param segments - Wall segments to test against
 * @returns Array of polygon vertices in angle-sorted order (world coordinates)
 */
export function computeVisibilityPolygon(
  lx: number,
  ly: number,
  radius: number,
  segments: WallSegment[],
): Point[] {
  // Pre-filter segments to only those within radius (AABB check)
  const nearSegments = segments.filter(seg => {
    const minX = Math.min(seg.x1, seg.x2);
    const maxX = Math.max(seg.x1, seg.x2);
    const minY = Math.min(seg.y1, seg.y2);
    const maxY = Math.max(seg.y1, seg.y2);
    return maxX >= lx - radius && minX <= lx + radius
        && maxY >= ly - radius && minY <= ly + radius;
  });

  // Sort by midpoint distance from light (closest first) for early termination
  nearSegments.sort((a, b) => {
    const aMid = ((a.x1 + a.x2) / 2 - lx) ** 2 + ((a.y1 + a.y2) / 2 - ly) ** 2;
    const bMid = ((b.x1 + b.x2) / 2 - lx) ** 2 + ((b.y1 + b.y2) / 2 - ly) ** 2;
    return aMid - bMid;
  });

  // Collect unique angles to all segment endpoints
  const angles: number[] = [];

  // Add boundary angles (subdivisions for smooth circle boundary)
  const step = Math.PI / 8; // 16 boundary rays
  for (let a = -Math.PI; a < Math.PI; a += step) {
    angles.push(a);
  }

  // Add rays toward each segment endpoint (+ epsilon offsets for corner peeking)
  for (const seg of nearSegments) {
    for (const [px, py] of [[seg.x1, seg.y1], [seg.x2, seg.y2]]) {
      const angle = Math.atan2(py - ly, px - lx);
      angles.push(angle - EPSILON);
      angles.push(angle);
      angles.push(angle + EPSILON);
    }
  }

  // Sort by angle
  angles.sort((a, b) => a - b);

  // Cast each ray and find the nearest intersection
  const polygon: Point[] = [];

  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    // Ray from (lx, ly) in direction (dx, dy), max distance = radius
    let closestDist = radius;
    let closestPoint: Point = { x: lx + dx * radius, y: ly + dy * radius };

    for (const seg of nearSegments) {
      const hit = raySegmentIntersection(lx, ly, dx, dy, seg);
      if (hit !== null && hit.dist < closestDist) {
        closestDist = hit.dist;
        closestPoint = hit.point;
      }
    }

    polygon.push(closestPoint);
  }

  return polygon;
}

/**
 * Test ray-segment intersection.
 * Ray: origin (ox, oy), direction (dx, dy)
 * Segment: (x1, y1) -> (x2, y2)
 * Returns intersection point and distance, or null if no hit.
 */
function raySegmentIntersection(
  ox: number, oy: number,
  dx: number, dy: number,
  seg: WallSegment,
): { point: Point; dist: number } | null {
  const sx = seg.x2 - seg.x1;
  const sy = seg.y2 - seg.y1;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t = ((seg.x1 - ox) * sy - (seg.y1 - oy) * sx) / denom;
  const u = ((seg.x1 - ox) * dy - (seg.y1 - oy) * dx) / denom;

  if (t < 0 || u < 0 || u > 1) return null;

  return {
    point: { x: ox + dx * t, y: oy + dy * t },
    dist: t,
  };
}
