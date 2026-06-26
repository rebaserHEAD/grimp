/**
 * Dirty flag system for frame skipping.
 *
 * Instead of redrawing the entire scene 60 times per second unconditionally,
 * we track what changed and skip frames when nothing is dirty.
 *
 * Flags:
 * - sceneDirty: entity/tile data changed (add, remove, move, edit, map load)
 * - cameraDirty: viewport changed (pan, zoom, resize)
 * - overlayDirty: cursor moved, tool state changed, selection changed
 * - connectionsDirty: device link data changed
 */

let sceneDirty = true;
let cameraDirty = true;
let overlayDirty = true;
let connectionsDirty = true;

// --- Setters ---

export function markSceneDirty(): void {
  sceneDirty = true;
}

export function markCameraDirty(): void {
  cameraDirty = true;
}

export function markOverlayDirty(): void {
  overlayDirty = true;
}

export function markConnectionsDirty(): void {
  connectionsDirty = true;
}

/** Mark everything dirty (map load, resize, etc.). */
export function markAllDirty(): void {
  sceneDirty = true;
  cameraDirty = true;
  overlayDirty = true;
  connectionsDirty = true;
}

// --- Queries ---

export function needsRedraw(): boolean {
  return sceneDirty || cameraDirty || overlayDirty || connectionsDirty;
}

export function isSceneDirty(): boolean {
  return sceneDirty;
}

export function isCameraDirty(): boolean {
  return cameraDirty;
}

export function isOverlayDirty(): boolean {
  return overlayDirty;
}

export function isConnectionsDirty(): boolean {
  return connectionsDirty;
}

// --- Clear ---

export function markClean(): void {
  sceneDirty = false;
  cameraDirty = false;
  overlayDirty = false;
  connectionsDirty = false;
}
