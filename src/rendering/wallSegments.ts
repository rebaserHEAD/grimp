import type { ImportedEntity } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';

export interface WallSegment {
  x1: number; y1: number;
  x2: number; y2: number;
}

export interface WallSegmentCache {
  segments: WallSegment[];
  getSegmentsInRadius(cx: number, cy: number, radius: number): WallSegment[];
}

/**
 * Build a cache of wall boundary segments from entities that have an Occluder component.
 *
 * Each wall tile occupies a 1x1 cell. Edges shared between adjacent wall tiles are
 * removed (internal edges), and colinear exposed edges are merged into longer segments.
 */
export function buildWallSegmentCache(
  entities: readonly ImportedEntity[],
  registry: IPrototypeRegistry,
): WallSegmentCache {
  // Step 1: Identify occluder positions
  const occluderSet = new Set<string>();
  for (const entity of entities) {
    const resolved = registry.getEntity(entity.prototype);
    if (!resolved) continue;
    const hasOccluder = resolved.components.some(c => c.type === 'Occluder');
    if (hasOccluder) {
      const x = Math.floor(entity.position.x);
      const y = Math.floor(entity.position.y);
      occluderSet.add(`${x},${y}`);
    }
  }

  if (occluderSet.size === 0) {
    return { segments: [], getSegmentsInRadius: () => [] };
  }

  // Step 2: Extract exposed edges (edges not shared with an adjacent occluder)
  // Each wall cell at (x, y) spans from (x, y) to (x+1, y+1).
  // Edges are defined as line segments in world coordinates.
  interface RawEdge {
    x1: number; y1: number;
    x2: number; y2: number;
    horizontal: boolean;
  }

  const edges: RawEdge[] = [];

  for (const key of occluderSet) {
    const [x, y] = key.split(',').map(Number);
    // Top edge (y+1)
    if (!occluderSet.has(`${x},${y + 1}`)) {
      edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1, horizontal: true });
    }
    // Bottom edge (y)
    if (!occluderSet.has(`${x},${y - 1}`)) {
      edges.push({ x1: x, y1: y, x2: x + 1, y2: y, horizontal: true });
    }
    // Left edge (x)
    if (!occluderSet.has(`${x - 1},${y}`)) {
      edges.push({ x1: x, y1: y, x2: x, y2: y + 1, horizontal: false });
    }
    // Right edge (x+1)
    if (!occluderSet.has(`${x + 1},${y}`)) {
      edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, horizontal: false });
    }
  }

  // Step 3: Merge colinear edges into longer segments
  const segments = mergeEdges(edges);

  // Step 4: Build spatial buckets for fast radius queries
  const BUCKET_SIZE = 8;
  const buckets = new Map<string, WallSegment[]>();
  for (const seg of segments) {
    const minBx = Math.floor(Math.min(seg.x1, seg.x2) / BUCKET_SIZE);
    const maxBx = Math.floor(Math.max(seg.x1, seg.x2) / BUCKET_SIZE);
    const minBy = Math.floor(Math.min(seg.y1, seg.y2) / BUCKET_SIZE);
    const maxBy = Math.floor(Math.max(seg.y1, seg.y2) / BUCKET_SIZE);
    for (let bx = minBx; bx <= maxBx; bx++) {
      for (let by = minBy; by <= maxBy; by++) {
        const key = `${bx},${by}`;
        let list = buckets.get(key);
        if (!list) { list = []; buckets.set(key, list); }
        list.push(seg);
      }
    }
  }

  return {
    segments,
    getSegmentsInRadius(cx: number, cy: number, radius: number): WallSegment[] {
      const seen = new Set<WallSegment>();
      const minBx = Math.floor((cx - radius) / BUCKET_SIZE);
      const maxBx = Math.floor((cx + radius) / BUCKET_SIZE);
      const minBy = Math.floor((cy - radius) / BUCKET_SIZE);
      const maxBy = Math.floor((cy + radius) / BUCKET_SIZE);
      for (let bx = minBx; bx <= maxBx; bx++) {
        for (let by = minBy; by <= maxBy; by++) {
          const list = buckets.get(`${bx},${by}`);
          if (list) for (const seg of list) seen.add(seg);
        }
      }
      return Array.from(seen);
    },
  };
}

/**
 * Remove or split wall segments that form edges of a specific tile.
 * Used to prevent wall-mounted lights from self-shadowing against their own wall.
 *
 * For merged segments that partially overlap the tile boundary, only the
 * overlapping portion is removed and the remaining parts are preserved.
 */
export function excludeTileEdges(
  segments: WallSegment[],
  tileX: number,
  tileY: number,
): WallSegment[] {
  const result: WallSegment[] = [];

  for (const seg of segments) {
    const isHorizontal = seg.y1 === seg.y2;
    const isVertical = seg.x1 === seg.x2;

    if (isHorizontal) {
      const y = seg.y1;
      // Check if this segment lies on the top or bottom edge of the tile
      if (y === tileY || y === tileY + 1) {
        const segMinX = Math.min(seg.x1, seg.x2);
        const segMaxX = Math.max(seg.x1, seg.x2);
        const overlapMin = Math.max(segMinX, tileX);
        const overlapMax = Math.min(segMaxX, tileX + 1);

        if (overlapMin >= overlapMax) {
          // No overlap with tile edge, keep as-is
          result.push(seg);
        } else {
          // Split: keep portions outside the tile edge
          if (segMinX < overlapMin) {
            result.push({ x1: segMinX, y1: y, x2: overlapMin, y2: y });
          }
          if (segMaxX > overlapMax) {
            result.push({ x1: overlapMax, y1: y, x2: segMaxX, y2: y });
          }
        }
      } else {
        result.push(seg);
      }
    } else if (isVertical) {
      const x = seg.x1;
      // Check if this segment lies on the left or right edge of the tile
      if (x === tileX || x === tileX + 1) {
        const segMinY = Math.min(seg.y1, seg.y2);
        const segMaxY = Math.max(seg.y1, seg.y2);
        const overlapMin = Math.max(segMinY, tileY);
        const overlapMax = Math.min(segMaxY, tileY + 1);

        if (overlapMin >= overlapMax) {
          result.push(seg);
        } else {
          if (segMinY < overlapMin) {
            result.push({ x1: x, y1: segMinY, x2: x, y2: overlapMin });
          }
          if (segMaxY > overlapMax) {
            result.push({ x1: x, y1: overlapMax, x2: x, y2: segMaxY });
          }
        }
      } else {
        result.push(seg);
      }
    } else {
      // Non-axis-aligned segment, keep as-is
      result.push(seg);
    }
  }

  return result;
}

function mergeEdges(
  edges: { x1: number; y1: number; x2: number; y2: number; horizontal: boolean }[],
): WallSegment[] {
  const segments: WallSegment[] = [];

  // Group edges by orientation and shared coordinate
  const groups = new Map<string, { x1: number; y1: number; x2: number; y2: number }[]>();
  for (const e of edges) {
    const key = e.horizontal ? `h:${e.y1}` : `v:${e.x1}`;
    const group = groups.get(key);
    if (group) group.push(e);
    else groups.set(key, [e]);
  }

  for (const [key, group] of groups) {
    const isHorizontal = key.startsWith('h:');
    if (isHorizontal) {
      group.sort((a, b) => a.x1 - b.x1);
      let cur = { ...group[0] };
      for (let i = 1; i < group.length; i++) {
        if (group[i].x1 === cur.x2) {
          cur.x2 = group[i].x2;
        } else {
          segments.push({ x1: cur.x1, y1: cur.y1, x2: cur.x2, y2: cur.y2 });
          cur = { ...group[i] };
        }
      }
      segments.push({ x1: cur.x1, y1: cur.y1, x2: cur.x2, y2: cur.y2 });
    } else {
      group.sort((a, b) => a.y1 - b.y1);
      let cur = { ...group[0] };
      for (let i = 1; i < group.length; i++) {
        if (group[i].y1 === cur.y2) {
          cur.y2 = group[i].y2;
        } else {
          segments.push({ x1: cur.x1, y1: cur.y1, x2: cur.x2, y2: cur.y2 });
          cur = { ...group[i] };
        }
      }
      segments.push({ x1: cur.x1, y1: cur.y1, x2: cur.x2, y2: cur.y2 });
    }
  }

  return segments;
}
