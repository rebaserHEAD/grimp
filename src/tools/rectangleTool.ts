import type { ITool, ToolContext } from './toolTypes';
import type { TileChange } from '../types';
import { ensureGridContainsBounds, getCell, setCell } from '../state/editorState';
import { createEntitiesAtPositions } from './entityBrushHelper';
import { createDecalsAtPositions } from './decalBrushHelper';

export class RectangleTool implements ITool {
  name = 'rectangle';
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

    const minX = Math.min(this.startX, this.endX);
    const maxX = Math.max(this.startX, this.endX);
    const minY = Math.min(this.startY, this.endY);
    const maxY = Math.max(this.startY, this.endY);

    const positions: [number, number][] = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        positions.push([x, y]);
      }
    }

    if (paletteItem.type === 'entity') {
      const { entityChanges } = createEntitiesAtPositions(
        positions, paletteItem.id, state.entities, state.nextEntityId, state.gridUid,
      );
      if (entityChanges.length > 0) {
        ctx.dispatch({
          type: 'APPLY_COMMAND',
          command: { label: 'Rectangle fill entities', tileChanges: [], entityChanges },
        });
      }
      return;
    }

    if (paletteItem.type === 'decal' && ctx.decalSettings) {
      const activeGrid = state.grids[state.activeGridIndex];
      const { decalChanges } = createDecalsAtPositions(
        positions, paletteItem.id, activeGrid.decals.decals, activeGrid.decals.nextDecalId, ctx.decalSettings,
      );
      if (decalChanges.length > 0) {
        ctx.dispatch({
          type: 'APPLY_COMMAND',
          command: { label: 'Rectangle fill decals', tileChanges: [], entityChanges: [], decalChanges },
        });
      }
      return;
    }

    if (paletteItem.type !== 'tile') return;

    // Expand grid to fit rectangle
    const expanded = ensureGridContainsBounds(state.grid, minX, minY, maxX, maxY, 0);
    if (expanded !== state.grid) {
      state.grid = expanded;
    }

    const changes: TileChange[] = [];
    for (const [x, y] of positions) {
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
        command: { label: 'Rectangle fill', tileChanges: changes, entityChanges: [] },
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
      const minX = Math.min(this.startX, this.endX);
      const maxX = Math.max(this.startX, this.endX);
      const minY = Math.min(this.startY, this.endY);
      const maxY = Math.max(this.startY, this.endY);

      const screenX = camera.worldToScreenX(minX, canvasW);
      const screenY = camera.worldToScreenY(maxY, canvasH); // maxY because Y-up
      const w = (maxX - minX + 1) * tileScreenSize;
      const h = (maxY - minY + 1) * tileScreenSize;

      canvasCtx.fillStyle = 'rgba(68, 136, 255, 0.15)';
      canvasCtx.fillRect(screenX, screenY, w, h);
      canvasCtx.strokeStyle = '#4488ff';
      canvasCtx.lineWidth = 2;
      canvasCtx.setLineDash([6, 3]);
      canvasCtx.strokeRect(screenX, screenY, w, h);
      canvasCtx.setLineDash([]);

      // Dimension label
      const dimW = maxX - minX + 1;
      const dimH = maxY - minY + 1;
      canvasCtx.fillStyle = '#4488ff';
      canvasCtx.font = '12px monospace';
      canvasCtx.textAlign = 'center';
      canvasCtx.fillText(`${dimW}x${dimH}`, screenX + w / 2, screenY - 4);
    } else {
      // Single tile cursor
      const drawX = camera.worldToScreenX(cursorTileX, canvasW);
      const drawY = camera.worldToScreenY(cursorTileY, canvasH);
      canvasCtx.strokeStyle = '#4488ff';
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
    }
  }

  deactivate() {
    this.dragging = false;
  }
}
