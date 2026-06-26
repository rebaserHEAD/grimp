import { markCameraDirty } from './dirtyFlags';

const TILE_SIZE = 32;

/**
 * Camera for the map editor.
 *
 * World space uses Y-up (SS14 convention: positive Y = up).
 * Screen space uses Y-down (canvas convention: positive Y = down).
 * The camera handles this conversion transparently.
 *
 * x, y are in tile-space, the center of the viewport in world tiles.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  /** Pan by screen-space delta (pixels). */
  pan(dxScreen: number, dyScreen: number) {
    const tileScreenSize = TILE_SIZE * this.zoom;
    this.x -= dxScreen / tileScreenSize;
    this.y += dyScreen / tileScreenSize; // Y-up: dragging down = camera moves up in world
    markCameraDirty();
  }

  /** Zoom centered on a screen point. */
  zoomAt(factor: number, screenX: number, screenY: number, canvasW: number, canvasH: number) {
    const tile = this.screenToTile(screenX, screenY, canvasW, canvasH);

    this.zoom *= factor;
    this.zoom = Math.max(0.1, Math.min(50, this.zoom));

    // Adjust camera so the world point under the cursor stays fixed
    const newTileScreenSize = TILE_SIZE * this.zoom;
    this.x = tile.x - (screenX - canvasW / 2) / newTileScreenSize;
    this.y = tile.y + (screenY - canvasH / 2) / newTileScreenSize;
    markCameraDirty();
  }

  /** Center and fit tile-space bounds into the canvas. */
  fitBounds(
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    canvasW: number,
    canvasH: number,
  ) {
    this.x = (bounds.minX + bounds.maxX) / 2;
    this.y = (bounds.minY + bounds.maxY) / 2;
    const mapW = bounds.maxX - bounds.minX;
    const mapH = bounds.maxY - bounds.minY;
    if (mapW > 0 && mapH > 0) {
      this.zoom = Math.min(canvasW / (mapW * TILE_SIZE), canvasH / (mapH * TILE_SIZE)) * 0.9;
    }
    markCameraDirty();
  }

  /** Convert screen coordinates to world tile-space coordinates. */
  screenToTile(screenX: number, screenY: number, canvasW: number, canvasH: number): { x: number; y: number } {
    const tileScreenSize = TILE_SIZE * this.zoom;
    return {
      x: (screenX - canvasW / 2) / tileScreenSize + this.x,
      y: -(screenY - canvasH / 2) / tileScreenSize + this.y, // Y-up: screen down = world Y decreases
    };
  }

  /**
   * Compute the screen X coordinate for a world X position.
   */
  worldToScreenX(worldX: number, canvasW: number): number {
    const tileScreenSize = TILE_SIZE * this.zoom;
    return (worldX - this.x) * tileScreenSize + canvasW / 2;
  }

  /**
   * Compute the screen Y coordinate for the top edge of a world tile.
   * (World Y increases upward, screen Y increases downward.)
   */
  worldToScreenY(worldY: number, canvasH: number): number {
    const tileScreenSize = TILE_SIZE * this.zoom;
    // worldY is the bottom of the tile in world space; top edge is worldY+1
    // Screen Y is inverted: higher world Y = lower screen Y value
    return -(worldY + 1 - this.y) * tileScreenSize + canvasH / 2;
  }

  /** Get the current tile screen size in pixels. */
  get tileScreenSize(): number {
    return TILE_SIZE * this.zoom;
  }
}
