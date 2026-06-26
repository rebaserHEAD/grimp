import type { ITool, ToolContext } from './toolTypes';
import type { TileChange, EntityChange, DecalChange } from '../types';
import { getCell, setCell } from '../state/editorState';
import { removeEntitiesAtPositions } from './entityBrushHelper';
import { removeDecalsAtPositions } from './decalBrushHelper';
import { markSceneDirty } from '../rendering/dirtyFlags';

export class EraseTool implements ITool {
  name = 'erase';
  cursor = 'crosshair';

  private erasing = false;
  private tileChanges: TileChange[] = [];
  private entityChanges: EntityChange[] = [];
  private decalChanges: DecalChange[] = [];
  private visited = new Set<string>();

  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button !== 0) return;
    this.erasing = true;
    this.tileChanges = [];
    this.entityChanges = [];
    this.decalChanges = [];
    this.visited.clear();
    this.eraseAt(ctx, tileX, tileY);
  }

  onMouseMove(ctx: ToolContext, tileX: number, tileY: number) {
    if (!this.erasing) return;
    this.eraseAt(ctx, tileX, tileY);
  }

  onMouseUp(ctx: ToolContext) {
    if (!this.erasing) return;
    this.erasing = false;
    if (this.tileChanges.length > 0 || this.entityChanges.length > 0 || this.decalChanges.length > 0) {
      const label = this.decalChanges.length > 0 ? 'Erase decals'
        : this.entityChanges.length > 0 ? 'Erase entities' : 'Erase tiles';
      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: {
          label,
          tileChanges: this.tileChanges,
          entityChanges: this.entityChanges,
          decalChanges: this.decalChanges.length > 0 ? this.decalChanges : undefined,
        },
      });
    }
    this.tileChanges = [];
    this.entityChanges = [];
    this.decalChanges = [];
    this.visited.clear();
  }

  renderPreview(
    canvasCtx: CanvasRenderingContext2D,
    toolCtx: ToolContext,
    cursorTileX: number,
    cursorTileY: number,
  ) {
    const { camera, canvasW, canvasH } = toolCtx;
    const tileScreenSize = camera.tileScreenSize;
    const drawX = camera.worldToScreenX(cursorTileX, canvasW);
    const drawY = camera.worldToScreenY(cursorTileY, canvasH);

    canvasCtx.strokeStyle = '#ff4444';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);

    // X mark
    canvasCtx.beginPath();
    canvasCtx.moveTo(drawX + 4, drawY + 4);
    canvasCtx.lineTo(drawX + tileScreenSize - 4, drawY + tileScreenSize - 4);
    canvasCtx.moveTo(drawX + tileScreenSize - 4, drawY + 4);
    canvasCtx.lineTo(drawX + 4, drawY + tileScreenSize - 4);
    canvasCtx.stroke();
  }

  private eraseAt(ctx: ToolContext, worldX: number, worldY: number) {
    const key = `${worldX},${worldY}`;
    if (this.visited.has(key)) return;
    this.visited.add(key);

    const { state, paletteItem } = ctx;

    // Erase entities if entity palette is selected
    if (paletteItem && paletteItem.type === 'entity') {
      const removals = removeEntitiesAtPositions(
        [[worldX, worldY]], state.entities, paletteItem.id,
      );
      this.entityChanges.push(...removals);
      return;
    }

    // Erase decals if decal palette is selected
    if (paletteItem && paletteItem.type === 'decal') {
      const activeGrid = state.grids[state.activeGridIndex];
      const removals = removeDecalsAtPositions(
        [[worldX, worldY]], activeGrid.decals.decals, paletteItem.id,
      );
      this.decalChanges.push(...removals);
      if (removals.length > 0) markSceneDirty();
      return;
    }

    // Otherwise erase tiles
    const cell = getCell(state.grid, worldX, worldY);
    if (!cell || cell.tileId === 'Space') return;

    const before = { ...cell };
    const after = { tileId: 'Space' };
    setCell(state.grid, worldX, worldY, after);

    this.tileChanges.push({ x: worldX, y: worldY, before, after });
    markSceneDirty(); // Invalidate compositor tile layer so erased tiles appear during drag
  }

  deactivate() {
    this.erasing = false;
    this.decalChanges = [];
    this.tileChanges = [];
    this.entityChanges = [];
    this.visited.clear();
  }
}
