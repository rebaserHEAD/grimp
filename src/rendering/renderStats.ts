/**
 * Render statistics collected during each frame.
 * Updated by the render loop, read by the PerformanceHUD.
 */

export interface RenderStats {
  fps: number;
  frameTime: number;       // ms for the last render frame
  drawCalls: number;       // drawImage + fillRect calls this frame
  totalEntities: number;
  visibleEntities: number;
  selectedCount: number;
  zoom: number;
  pxPerTile: number;
  lodActive: boolean;
  skippedFrames: number;   // consecutive frames skipped by dirty flags
  tilesRedrawn: boolean;    // did tile layer re-render this frame?
  entitiesRedrawn: boolean; // did entity layer re-render this frame?
  compositeOnly: boolean;   // was this frame composite-only (no layer re-render)?
  zoomDeferred: boolean;    // is zoom-deferred scaling active?
}

const stats: RenderStats = {
  fps: 0,
  frameTime: 0,
  drawCalls: 0,
  totalEntities: 0,
  visibleEntities: 0,
  selectedCount: 0,
  zoom: 1,
  pxPerTile: 32,
  lodActive: false,
  skippedFrames: 0,
  tilesRedrawn: false,
  entitiesRedrawn: false,
  compositeOnly: true,
  zoomDeferred: false,
};

// FPS tracking
let frameCount = 0;
let lastFpsTime = performance.now();

/** Call at the start of each animation frame (before dirty check). */
export function statsFrameTick(): void {
  frameCount++;
  const now = performance.now();
  const elapsed = now - lastFpsTime;
  if (elapsed >= 1000) {
    stats.fps = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFpsTime = now;
  }
}

/** Call when a frame is skipped (dirty flags clean). */
export function statsFrameSkipped(): void {
  stats.skippedFrames++;
  // Only zero per-frame metrics; scene stats (visible, total, lod) persist from last real frame
  stats.frameTime = 0;
  stats.drawCalls = 0;
}

/** Call at start of an actual render frame. */
export function statsFrameStart(): void {
  stats.skippedFrames = 0;
  stats.drawCalls = 0;
}

/** Call at end of render frame with timing. */
export function statsFrameEnd(startTime: number): void {
  stats.frameTime = Math.round((performance.now() - startTime) * 100) / 100;
}

export function statsSetDrawCalls(n: number): void { stats.drawCalls = n; }
export function statsAddDrawCalls(n: number): void { stats.drawCalls += n; }
export function statsSetTotalEntities(n: number): void { stats.totalEntities = n; }
export function statsSetVisibleEntities(n: number): void { stats.visibleEntities = n; }
export function statsSetSelectedCount(n: number): void { stats.selectedCount = n; }
export function statsSetCamera(zoom: number, pxPerTile: number): void {
  stats.zoom = zoom;
  stats.pxPerTile = pxPerTile;
}
export function statsSetLodActive(active: boolean): void { stats.lodActive = active; }
export function statsSetLayerRedraws(tiles: boolean, entities: boolean): void {
  stats.tilesRedrawn = tiles;
  stats.entitiesRedrawn = entities;
  stats.compositeOnly = !tiles && !entities;
}
export function statsSetZoomDeferred(deferred: boolean): void {
  stats.zoomDeferred = deferred;
}

/** Get a snapshot of current stats (read-only). */
export function getStats(): Readonly<RenderStats> {
  return stats;
}
