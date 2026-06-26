/**
 * Space Clown, sporadic floating clown easter egg.
 *
 * Call `triggerSpaceClown()` to spawn a clown that drifts across the viewport,
 * slowly tumbling in zero-gravity, then disappears off the other side.
 */

import { markOverlayDirty } from './dirtyFlags';

interface SpaceClown {
  x: number;        // current position (px)
  y: number;
  vx: number;       // velocity (px per second)
  vy: number;
  rotation: number;  // radians
  spinRate: number;  // radians per second
  scale: number;     // size multiplier
  opacity: number;   // fade-in/out
  age: number;       // seconds alive
}

let activeClown: SpaceClown | null = null;
let clownImg: HTMLImageElement | null = null;
let clownLoading = false;
let lastTimestamp = 0;

/** Load the clown image if not already loaded. */
function ensureClownImage(): void {
  if (clownImg || clownLoading) return;
  clownLoading = true;
  const img = new Image();
  img.onload = () => { clownImg = img; };
  img.onerror = () => { clownLoading = false; };
  img.src = '/images/clown.png';
}

/** Spawn a clown that enters from a random edge and drifts across the viewport. */
export function triggerSpaceClown(canvasW: number, canvasH: number): void {
  ensureClownImage();

  const size = 48 + Math.random() * 32; // 48-80px
  const speed = 150 + Math.random() * 100; // 150-250 px/sec

  // Pick a random point on the viewport perimeter (just outside)
  const perim = 2 * (canvasW + canvasH);
  const p = Math.random() * perim;
  let x: number, y: number;
  if (p < canvasW) {
    // Top edge
    x = p; y = -size;
  } else if (p < canvasW + canvasH) {
    // Right edge
    x = canvasW + size; y = p - canvasW;
  } else if (p < 2 * canvasW + canvasH) {
    // Bottom edge
    x = p - canvasW - canvasH; y = canvasH + size;
  } else {
    // Left edge
    x = -size; y = p - 2 * canvasW - canvasH;
  }

  // Aim roughly toward the opposite side with some angular spread.
  // Base angle: from spawn point toward canvas center
  const toCenterAngle = Math.atan2(canvasH / 2 - y, canvasW / 2 - x);
  // Add random spread (±40°) so it doesn't always cross dead center
  const spread = (Math.random() - 0.5) * (Math.PI * 0.45);
  const angle = toCenterAngle + spread;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;

  activeClown = {
    x, y, vx, vy,
    rotation: Math.random() * Math.PI * 2,
    spinRate: (Math.random() - 0.5) * 1.5, // -0.75 to 0.75 rad/s tumble
    scale: size / 64, // assuming 64px source
    opacity: 0,
    age: 0,
  };

  lastTimestamp = 0;
  markOverlayDirty();
}

/** Whether a clown is currently floating. */
export function isClownActive(): boolean {
  return activeClown !== null;
}

/**
 * Update and render the space clown onto the given canvas context.
 * Should be called every frame from the render loop, AFTER the background
 * and BEFORE or AFTER the compositor (it floats above everything).
 *
 * Returns true if the clown is still active (needs continued rendering).
 */
export function renderSpaceClown(
  ctx: CanvasRenderingContext2D,
  timestamp: number,
  canvasW: number,
  canvasH: number,
): boolean {
  if (!activeClown) return false;
  if (!clownImg) {
    // Image still loading, keep alive, mark dirty
    markOverlayDirty();
    return true;
  }

  // Compute delta time
  if (lastTimestamp === 0) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // cap at 100ms
  lastTimestamp = timestamp;

  const c = activeClown;
  c.age += dt;

  // Update position
  c.x += c.vx * dt;
  c.y += c.vy * dt;
  c.rotation += c.spinRate * dt;

  // Kill once fully off-screen (after fade-in period so we don't kill on entry)
  const drawSize = clownImg.width * c.scale;
  const margin = drawSize;
  if (c.age > 1.5 && (
    c.x < -margin || c.x > canvasW + margin ||
    c.y < -margin || c.y > canvasH + margin
  )) {
    activeClown = null;
    return false;
  }

  // Fade in over first 1s, fade out as it nears the edge
  const fadeIn = Math.min(c.age / 1.0, 1);
  // Distance from nearest edge (0 at edge, large in center)
  const edgeDist = Math.min(c.x + margin, canvasW + margin - c.x, c.y + margin, canvasH + margin - c.y);
  const fadeOut = Math.min(edgeDist / (margin * 2), 1);
  c.opacity = fadeIn * fadeOut;

  // Draw the clown
  ctx.save();
  ctx.globalAlpha = c.opacity;
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rotation);
  ctx.imageSmoothingEnabled = false; // pixel art!
  ctx.drawImage(clownImg, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  ctx.restore();

  // Keep rendering
  markOverlayDirty();
  return true;
}

/** Reset state (for testing). */
export function resetSpaceClown(): void {
  activeClown = null;
  clownImg = null;
  clownLoading = false;
  lastTimestamp = 0;
}
