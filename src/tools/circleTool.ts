import type { ITool, ToolContext } from './toolTypes';
import type { TileChange } from '../types';
import { ensureGridContainsBounds, getCell, setCell } from '../state/editorState';
import { createEntitiesAtPositions } from './entityBrushHelper';
import { createDecalsAtPositions } from './decalBrushHelper';

/** Compute all tiles inside a filled circle using midpoint algorithm. */
function filledCircleTiles(cx: number, cy: number, radius: number): [number, number][] {
  const tiles: [number, number][] = [];
  const r = Math.round(radius);
  if (r <= 0) {
    tiles.push([cx, cy]);
    return tiles;
  }

  const rSq = r * r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= rSq) {
        tiles.push([cx + dx, cy + dy]);
      }
    }
  }
  return tiles;
}

export class CircleTool implements ITool {
  name = 'circle';
  cursor = 'crosshair';

  private dragging = false;
  private centerX = 0;
  private centerY = 0;
  private radius = 0;

  onMouseDown(_ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button !== 0) return;
    this.dragging = true;
    this.centerX = tileX;
    this.centerY = tileY;
    this.radius = 0;
  }

  onMouseMove(_ctx: ToolContext, tileX: number, tileY: number) {
    if (!this.dragging) return;
    const dx = tileX - this.centerX;
    const dy = tileY - this.centerY;
    this.radius = Math.sqrt(dx * dx + dy * dy);
  }

  onMouseUp(ctx: ToolContext) {
    if (!this.dragging) return;
    this.dragging = false;

    const { state, paletteItem } = ctx;
    if (!paletteItem) return;

    const tiles = filledCircleTiles(this.centerX, this.centerY, this.radius);
    if (tiles.length === 0) return;

    if (paletteItem.type === 'entity') {
      const { entityChanges } = createEntitiesAtPositions(
        tiles, paletteItem.id, state.entities, state.nextEntityId, state.gridUid,
      );
      if (entityChanges.length > 0) {
        ctx.dispatch({
          type: 'APPLY_COMMAND',
          command: { label: 'Circle fill entities', tileChanges: [], entityChanges },
        });
      }
      return;
    }

    if (paletteItem.type === 'decal' && ctx.decalSettings) {
      const activeGrid = state.grids[state.activeGridIndex];
      const { decalChanges } = createDecalsAtPositions(
        tiles, paletteItem.id, activeGrid.decals.decals, activeGrid.decals.nextDecalId, ctx.decalSettings,
      );
      if (decalChanges.length > 0) {
        ctx.dispatch({
          type: 'APPLY_COMMAND',
          command: { label: 'Circle fill decals', tileChanges: [], entityChanges: [], decalChanges },
        });
      }
      return;
    }

    if (paletteItem.type !== 'tile') return;

    // Expand grid
    const r = Math.round(this.radius);
    const expanded = ensureGridContainsBounds(
      state.grid,
      this.centerX - r, this.centerY - r,
      this.centerX + r, this.centerY + r,
      0,
    );
    if (expanded !== state.grid) {
      state.grid = expanded;
    }

    const changes: TileChange[] = [];
    for (const [x, y] of tiles) {
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
        command: { label: 'Circle fill', tileChanges: changes, entityChanges: [] },
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
      const tiles = filledCircleTiles(this.centerX, this.centerY, this.radius);
      canvasCtx.fillStyle = 'rgba(0, 200, 255, 0.2)';
      for (const [x, y] of tiles) {
        const sx = camera.worldToScreenX(x, canvasW);
        const sy = camera.worldToScreenY(y, canvasH);
        canvasCtx.fillRect(sx, sy, tileScreenSize, tileScreenSize);
      }

      // Center marker
      const csx = camera.worldToScreenX(this.centerX, canvasW);
      const csy = camera.worldToScreenY(this.centerY, canvasH);
      canvasCtx.strokeStyle = '#00ccff';
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(csx, csy, tileScreenSize, tileScreenSize);

      // Radius label
      canvasCtx.fillStyle = '#00ccff';
      canvasCtx.font = '12px monospace';
      canvasCtx.textAlign = 'center';
      const labelX = camera.worldToScreenX(cursorTileX, canvasW) + tileScreenSize / 2;
      const labelY = camera.worldToScreenY(cursorTileY, canvasH) - 4;
      canvasCtx.fillText(`r=${Math.round(this.radius)}`, labelX, labelY);
    } else {
      const drawX = camera.worldToScreenX(cursorTileX, canvasW);
      const drawY = camera.worldToScreenY(cursorTileY, canvasH);
      canvasCtx.strokeStyle = '#00ccff';
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
    }
  }

  deactivate() {
    this.dragging = false;
  }
}
