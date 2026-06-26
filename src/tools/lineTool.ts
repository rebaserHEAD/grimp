import type { ITool, ToolContext } from './toolTypes';
import type { TileChange } from '../types';
import { ensureGridContainsBounds, getCell, setCell } from '../state/editorState';
import { createEntitiesAtPositions } from './entityBrushHelper';
import { createDecalsAtPositions } from './decalBrushHelper';

/** Bresenham's line algorithm, returns all tiles along the line. */
function bresenham(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const points: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0;
  let cy = y0;

  while (true) {
    points.push([cx, cy]);
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return points;
}

export class LineTool implements ITool {
  name = 'line';
  cursor = 'crosshair';

  private dragging = false;
  private startX = 0;
  private startY = 0;
  private endX = 0;
  private endY = 0;

  onMouseDown(_ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button !== 0) return;
    this.dragging = true;
    this.startX = tileX;
    this.startY = tileY;
    this.endX = tileX;
    this.endY = tileY;
  }

  onMouseMove(_ctx: ToolContext, tileX: number, tileY: number) {
    if (!this.dragging) return;
    this.endX = tileX;
    this.endY = tileY;
  }

  onMouseUp(ctx: ToolContext) {
    if (!this.dragging) return;
    this.dragging = false;

    const { state, paletteItem } = ctx;
    if (!paletteItem) return;

    const points = bresenham(this.startX, this.startY, this.endX, this.endY);
    if (points.length === 0) return;

    if (paletteItem.type === 'entity') {
      const { entityChanges } = createEntitiesAtPositions(
        points, paletteItem.id, state.entities, state.nextEntityId, state.gridUid,
      );
      if (entityChanges.length > 0) {
        ctx.dispatch({
          type: 'APPLY_COMMAND',
          command: { label: 'Line draw entities', tileChanges: [], entityChanges },
        });
      }
      return;
    }

    if (paletteItem.type === 'decal' && ctx.decalSettings) {
      const activeGrid = state.grids[state.activeGridIndex];
      const { decalChanges } = createDecalsAtPositions(
        points, paletteItem.id, activeGrid.decals.decals, activeGrid.decals.nextDecalId, ctx.decalSettings,
      );
      if (decalChanges.length > 0) {
        ctx.dispatch({
          type: 'APPLY_COMMAND',
          command: { label: 'Line draw decals', tileChanges: [], entityChanges: [], decalChanges },
        });
      }
      return;
    }

    if (paletteItem.type !== 'tile') return;

    // Expand grid
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const expanded = ensureGridContainsBounds(state.grid, minX, minY, maxX, maxY, 0);
    if (expanded !== state.grid) {
      state.grid = expanded;
    }

    const changes: TileChange[] = [];
    const visited = new Set<string>();
    for (const [x, y] of points) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const cell = getCell(state.grid, x, y);
      if (!cell || cell.tileId === paletteItem.id) continue;
      const before = { ...cell };
      const after = { tileId: paletteItem.id };
      setCell(state.grid, x, y, after);
      changes.push({ x, y, before, after });
    }

    if (changes.length > 0) {
      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: { label: 'Line draw', tileChanges: changes, entityChanges: [] },
      });
    }
  }

  renderPreview(
    canvasCtx: CanvasRenderingContext2D,
    toolCtx: ToolContext,
    cursorTileX: number,
    cursorTileY: number,
  ) {
    const { camera, canvasW, canvasH } = toolCtx;
    const tileScreenSize = camera.tileScreenSize;

    if (this.dragging) {
      const points = bresenham(this.startX, this.startY, this.endX, this.endY);
      canvasCtx.fillStyle = 'rgba(255, 200, 0, 0.25)';
      for (const [x, y] of points) {
        const sx = camera.worldToScreenX(x, canvasW);
        const sy = camera.worldToScreenY(y, canvasH);
        canvasCtx.fillRect(sx, sy, tileScreenSize, tileScreenSize);
      }

      // Outline start and end
      canvasCtx.strokeStyle = '#ffcc00';
      canvasCtx.lineWidth = 2;
      const sx0 = camera.worldToScreenX(this.startX, canvasW);
      const sy0 = camera.worldToScreenY(this.startY, canvasH);
      canvasCtx.strokeRect(sx0, sy0, tileScreenSize, tileScreenSize);
      const sx1 = camera.worldToScreenX(this.endX, canvasW);
      const sy1 = camera.worldToScreenY(this.endY, canvasH);
      canvasCtx.strokeRect(sx1, sy1, tileScreenSize, tileScreenSize);

      // Length label
      canvasCtx.fillStyle = '#ffcc00';
      canvasCtx.font = '12px monospace';
      canvasCtx.textAlign = 'center';
      canvasCtx.fillText(`${points.length}`, sx1 + tileScreenSize / 2, sy1 - 4);
    } else {
      const drawX = camera.worldToScreenX(cursorTileX, canvasW);
      const drawY = camera.worldToScreenY(cursorTileY, canvasH);
      canvasCtx.strokeStyle = '#ffcc00';
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
    }
  }

  deactivate() {
    this.dragging = false;
  }
}
