const TWO_PI = 2 * Math.PI;

/**
 * Normalize a rotation angle to [0, 2π).
 * Snaps to nearest 90° increment (0, π/2, π, 3π/2) if within floating-point tolerance.
 */
export function normalizeRotation(radians: number): number {
  let norm = ((radians % TWO_PI) + TWO_PI) % TWO_PI;
  // Snap to nearest 90° increment to avoid floating-point drift
  const HALF_PI = Math.PI / 2;
  const nearest = Math.round(norm / HALF_PI) * HALF_PI;
  if (Math.abs(norm - nearest) < 1e-9) {
    norm = nearest >= TWO_PI ? 0 : nearest;
  }
  return norm;
}

/**
 * Build a components array containing a Transform component for a newly-placed entity.
 * SS14 requires Transform with pos, parent (grid UID), and optionally rot.
 */
export function buildTransformComponent(
  position: { x: number; y: number },
  rotation: number,
  gridUid: number,
): Record<string, unknown>[] {
  const transform: Record<string, unknown> = {
    type: 'Transform',
    pos: `${position.x},${position.y}`,
    parent: gridUid,
  };
  if (rotation !== 0) {
    transform.rot = `${rotation} rad`;
  }
  return [transform];
}

/**
 * Update the Transform component's `pos` field in a components array.
 * Returns a new array with the Transform updated (or unchanged if none exists).
 */
/**
 * Update the Transform component's `rot` field in a components array.
 * Returns a new array with the Transform updated (or unchanged if none exists).
 */
export function updateTransformRot(
  components: Record<string, unknown>[],
  newRot: number,
): Record<string, unknown>[] {
  return components.map(c => {
    if (c.type === 'Transform') {
      const updated = { ...c };
      if (newRot !== 0) {
        updated.rot = `${newRot} rad`;
      } else {
        delete updated.rot;
      }
      return updated;
    }
    return c;
  });
}

/**
 * Update the Transform component's `pos` field in a components array.
 * Returns a new array with the Transform updated (or unchanged if none exists).
 */
export function updateTransformPos(
  components: Record<string, unknown>[],
  newPos: { x: number; y: number },
): Record<string, unknown>[] {
  return components.map(c => {
    if (c.type === 'Transform') {
      return { ...c, pos: `${newPos.x},${newPos.y}` };
    }
    return c;
  });
}

/**
 * Clone a components array and update the Transform pos in a single pass.
 * Avoids the double-iteration of components.map(c => ({...c})) + updateTransformPos().
 */
export function cloneComponentsWithPos(
  components: Record<string, unknown>[],
  newPos: { x: number; y: number },
): Record<string, unknown>[] {
  return components.map(c => {
    if (c.type === 'Transform') {
      return { ...c, pos: `${newPos.x},${newPos.y}` };
    }
    return { ...c };
  });
}

/**
 * Clone a components array and update both Transform pos and rot in a single pass.
 */
export function cloneComponentsWithPosRot(
  components: Record<string, unknown>[],
  newPos: { x: number; y: number },
  newRot: number,
): Record<string, unknown>[] {
  return components.map(c => {
    if (c.type === 'Transform') {
      const updated: Record<string, unknown> = { ...c, pos: `${newPos.x},${newPos.y}` };
      if (newRot !== 0) {
        updated.rot = `${newRot} rad`;
      } else {
        delete updated.rot;
      }
      return updated;
    }
    return { ...c };
  });
}
