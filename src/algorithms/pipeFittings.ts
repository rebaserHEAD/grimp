/**
 * Pipe auto-fitting algorithm.
 *
 * Given a set of tile positions where pipes exist, determines the correct
 * prototype (Straight/Bend/TJunction/Fourway) and rotation for each tile
 * based on 4-directional neighbor analysis.
 *
 * Works for both gas pipes (GasPipe*) and disposal pipes (Disposal*).
 */

export interface FittedPipe {
  x: number;
  y: number;
  prototype: string;
  rotation: number; // radians
  color?: string;
}

export type PipeFamily = 'gas' | 'disposal';

const GAS_PROTOTYPES = {
  straight: 'GasPipeStraight',
  bend: 'GasPipeBend',
  tJunction: 'GasPipeTJunction',
  fourway: 'GasPipeFourway',
};

const DISPOSAL_PROTOTYPES = {
  straight: 'DisposalPipe',
  bend: 'DisposalBend',
  tJunction: 'DisposalJunction',
  fourway: 'DisposalJunction', // disposal doesn't have a dedicated 4-way; use junction
};

/**
 * Compute fitted pipe entities for a set of tile positions.
 *
 * @param tiles - Set of "x,y" strings representing pipe tile positions
 * @param family - 'gas' or 'disposal'
 * @param color - Optional hex color string for AtmosPipeColor (gas pipes only)
 * @returns Array of fitted pipe entities with correct prototypes and rotations
 */
export function fitPipes(
  tiles: ReadonlySet<string>,
  family: PipeFamily = 'gas',
  color?: string,
): FittedPipe[] {
  const protos = family === 'gas' ? GAS_PROTOTYPES : DISPOSAL_PROTOTYPES;
  const results: FittedPipe[] = [];

  for (const key of tiles) {
    const [x, y] = parseKey(key);

    const hasN = tiles.has(`${x},${y + 1}`);
    const hasS = tiles.has(`${x},${y - 1}`);
    const hasE = tiles.has(`${x + 1},${y}`);
    const hasW = tiles.has(`${x - 1},${y}`);

    const count = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasE ? 1 : 0) + (hasW ? 1 : 0);

    let prototype: string;
    let rotation: number;

    if (count >= 4) {
      prototype = protos.fourway;
      rotation = 0;
    } else if (count === 3) {
      prototype = protos.tJunction;
      rotation = getTJunctionRotation(hasN, hasS, hasE, hasW);
    } else if (count === 2) {
      if ((hasN && hasS) || (hasE && hasW)) {
        // Straight pipe
        prototype = protos.straight;
        rotation = (hasE && hasW) ? Math.PI / 2 : 0;
      } else {
        // Bend, both gas and disposal use the same sprite orientation (S+W at rot 0)
        prototype = protos.bend;
        rotation = getBendRotation(hasN, hasS, hasE, hasW);
      }
    } else {
      // 0 or 1 connection, straight pipe oriented toward the single connection
      prototype = protos.straight;
      if (hasE || hasW) {
        rotation = Math.PI / 2;
      } else {
        rotation = 0; // default vertical (N-S) for 0 connections or N/S single
      }
    }

    results.push({
      x,
      y,
      prototype,
      rotation,
      color: family === 'gas' ? color : undefined,
    });
  }

  return results;
}

/**
 * Get T-junction rotation based on which direction is MISSING.
 *
 * SS14 T-junction default (rotation 0 = south frame) = TSouth.
 * TSouth has connections S+E+W (missing N).
 * Rotating TSouth by θ transforms which direction is missing:
 *   rot 0:    missing N (default, TSouth)
 *   rot π/2:  missing W (CCW: N→W)
 *   rot π:    missing S (N→S)
 *   rot -π/2: missing E (N→E)
 */
function getTJunctionRotation(hasN: boolean, hasS: boolean, hasE: boolean, hasW: boolean): number {
  if (!hasN) return 0;
  if (!hasW) return Math.PI / 2;
  if (!hasS) return Math.PI;
  if (!hasE) return -Math.PI / 2;
  return 0; // fallback (shouldn't happen with count===3)
}

/**
 * Get pipe bend rotation based on which two directions are connected.
 *
 * SS14 pipe bend default (rotation 0 = south frame) = SWBend (connects S+W).
 * Rotating the SWBend prototype by θ transforms its connections:
 *   rot 0:    S+W (default)
 *   rot π/2:  E+S (CCW rotation: S→E, W→S)
 *   rot π:    N+E (S→N, W→E)
 *   rot -π/2: W+N (S→W, W→N)
 */
function getBendRotation(hasN: boolean, hasS: boolean, hasE: boolean, hasW: boolean): number {
  if (hasS && hasW) return 0;
  if (hasE && hasS) return Math.PI / 2;
  if (hasN && hasE) return Math.PI;
  if (hasW && hasN) return -Math.PI / 2;
  return 0; // fallback
}


function parseKey(key: string): [number, number] {
  const comma = key.indexOf(',');
  return [
    parseInt(key.substring(0, comma), 10),
    parseInt(key.substring(comma + 1), 10),
  ];
}

/**
 * Merge new pipe positions with existing pipe entities of the same type,
 * compute fittings for the combined set, and return the entity changes needed.
 *
 * @param newTiles - Array of {x,y} tile positions to add
 * @param existingPipeEntities - Existing pipe entities on the map (same network)
 * @param family - 'gas' or 'disposal'
 * @param color - Optional pipe color
 * @returns Object with entitiesToRemove (UIDs) and entitiesToAdd (fitted pipes)
 */
export function computePipeChanges(
  newTiles: { x: number; y: number }[],
  existingPipeEntities: { uid: number; x: number; y: number }[],
  family: PipeFamily = 'gas',
  color?: string,
): {
  removedUids: number[];
  fittedPipes: FittedPipe[];
} {
  // Build combined tile set
  const allTiles = new Set<string>();
  const existingByKey = new Map<string, number>(); // key -> uid

  for (const e of existingPipeEntities) {
    const key = `${Math.floor(e.x)},${Math.floor(e.y)}`;
    allTiles.add(key);
    existingByKey.set(key, e.uid);
  }

  for (const t of newTiles) {
    allTiles.add(`${t.x},${t.y}`);
  }

  // Find all tiles that need refitting: new tiles + their neighbors that already exist
  const affectedKeys = new Set<string>();
  for (const t of newTiles) {
    const key = `${t.x},${t.y}`;
    affectedKeys.add(key);
    // Check if any neighbor is an existing pipe that needs refitting
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nkey = `${t.x + dx},${t.y + dy}`;
      if (existingByKey.has(nkey)) {
        affectedKeys.add(nkey);
      }
    }
  }

  // Compute fittings for affected tiles using the full combined set for neighbor lookups
  const fitted = fitPipes(allTiles, family, color);

  // Filter to only affected tiles
  const affectedFitted = fitted.filter(p => affectedKeys.has(`${p.x},${p.y}`));

  // Collect UIDs of existing entities that are being replaced
  const removedUids: number[] = [];
  for (const key of affectedKeys) {
    const uid = existingByKey.get(key);
    if (uid !== undefined) {
      removedUids.push(uid);
    }
  }

  return { removedUids, fittedPipes: affectedFitted };
}
