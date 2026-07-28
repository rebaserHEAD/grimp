import type { ITool, ToolContext } from './toolTypes';
import type { TileChange, EntityChange, DecalChange } from '../types';
import { ensureGridContains, getCell, setCell } from '../state/editorState';
import { createEntitiesAtPositions } from './entityBrushHelper';
import { createDecalsAtPositions } from './decalBrushHelper';
import { markSceneDirty } from '../rendering/dirtyFlags';

export class PaintTool implements ITool {
  name = 'paint';
  cursor = 'crosshair';

  private painting = false;
  private tileChanges: TileChange[] = [];
  private entityChanges: EntityChange[] = [];
  private decalChanges: DecalChange[] = [];
  private visited = new Set<string>();
  // Live state captured at stroke start so deactivate() can revert. paintAt
  // mutates the grid and the id counters DURING the drag (that's how the
  // stroke previews); the undo command only exists once onMouseUp commits.
  // Cancelling mid-stroke therefore has to put the mutations back itself, or
  // the painted tiles would survive as silent, non-undoable edits.
  private strokeState: ToolContext['state'] | null = null;
  private strokeNextEntityId = 0;
  private strokeNextDecalId = 0;

  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button !== 0) return;
    this.painting = true;
    this.tileChanges = [];
    this.entityChanges = [];
    this.decalChanges = [];
    this.visited.clear();
    this.strokeState = ctx.state;
    this.strokeNextEntityId = ctx.state.nextEntityId;
    this.strokeNextDecalId = ctx.state.grids[ctx.state.activeGridIndex]?.decals.nextDecalId ?? 0;
    this.paintAt(ctx, tileX, tileY);
  }

  onMouseMove(ctx: ToolContext, tileX: number, tileY: number) {
    if (!this.painting) return;
    this.paintAt(ctx, tileX, tileY);
  }

  onMouseUp(ctx: ToolContext) {
    if (!this.painting) return;
    this.painting = false;
    if (this.tileChanges.length > 0 || this.entityChanges.length > 0 || this.decalChanges.length > 0) {
      const label =
        this.decalChanges.length > 0
          ? 'Paint decals'
          : this.entityChanges.length > 0
            ? 'Paint entities'
            : 'Paint tiles';
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
    this.strokeState = null;
  }

  renderPreview(canvasCtx: CanvasRenderingContext2D, toolCtx: ToolContext, cursorTileX: number, cursorTileY: number) {
    if (!toolCtx.paletteItem) return;

    const { camera, canvasW, canvasH } = toolCtx;
    const tileScreenSize = camera.tileScreenSize;
    const drawX = camera.worldToScreenX(cursorTileX, canvasW);
    const drawY = camera.worldToScreenY(cursorTileY, canvasH);

    canvasCtx.strokeStyle = '#00ff00';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
  }

  private paintAt(ctx: ToolContext, worldX: number, worldY: number) {
    const { state, paletteItem } = ctx;
    if (!paletteItem) return;

    const key = `${worldX},${worldY}`;
    if (this.visited.has(key)) return;
    this.visited.add(key);

    if (paletteItem.type === 'tile') {
      // Tile painting
      const expanded = ensureGridContains(state.grid, worldX, worldY);
      if (expanded !== state.grid) {
        state.grid = expanded;
      }

      const cell = getCell(state.grid, worldX, worldY);
      if (!cell || cell.tileId === paletteItem.id) return;

      const before = { ...cell };
      // Reset variant/flags/rotationMirroring when changing tile type.
      // Preserving the old tile's variant on a new type can produce out-of-range
      // variants that crash the SS14 MapRenderer.
      const after = { tileId: paletteItem.id };
      setCell(state.grid, worldX, worldY, after);

      this.tileChanges.push({ x: worldX, y: worldY, before, after });
      markSceneDirty(); // Invalidate compositor tile layer so changes appear during drag
    } else if (paletteItem.type === 'entity') {
      // Entity painting, place one entity per tile
      const { entityChanges, nextEntityId } = createEntitiesAtPositions(
        [[worldX, worldY]],
        paletteItem.id,
        state.entities,
        state.nextEntityId,
        state.gridUid,
      );
      if (entityChanges.length > 0) {
        this.entityChanges.push(...entityChanges);
        // Update nextEntityId for subsequent placements in same stroke
        state.nextEntityId = nextEntityId;
      }
    } else if (paletteItem.type === 'decal' && ctx.decalSettings) {
      // Decal painting, place one decal per tile
      const activeGrid = state.grids[state.activeGridIndex];
      const { decalChanges, nextDecalId } = createDecalsAtPositions(
        [[worldX, worldY]],
        paletteItem.id,
        activeGrid.decals.decals,
        activeGrid.decals.nextDecalId,
        ctx.decalSettings,
      );
      if (decalChanges.length > 0) {
        this.decalChanges.push(...decalChanges);
        // Update nextDecalId for subsequent placements in same stroke
        activeGrid.decals.nextDecalId = nextDecalId;
        markSceneDirty();
      }
    }
  }

  /**
   * Cancel an in-progress stroke. Reverts the live grid mutations and id
   * counters, since no undo command exists until onMouseUp commits. Leftover
   * grid expansion from ensureGridContains stays, matching what undo of a
   * committed stroke leaves behind.
   */
  deactivate() {
    if (this.painting && this.strokeState) {
      const state = this.strokeState;
      for (let i = this.tileChanges.length - 1; i >= 0; i--) {
        const c = this.tileChanges[i];
        setCell(state.grid, c.x, c.y, c.before);
      }
      state.nextEntityId = this.strokeNextEntityId;
      const activeGrid = state.grids[state.activeGridIndex];
      if (activeGrid) activeGrid.decals.nextDecalId = this.strokeNextDecalId;
      if (this.tileChanges.length > 0 || this.decalChanges.length > 0) markSceneDirty();
    }
    this.painting = false;
    this.tileChanges = [];
    this.entityChanges = [];
    this.decalChanges = [];
    this.visited.clear();
    this.strokeState = null;
  }
}
