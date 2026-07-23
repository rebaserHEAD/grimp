import type { ITool, ToolContext } from './toolTypes';
import { getCell } from '../state/editorState';
import { getEntitiesAtTile, isLayerVisible, getCachedDrawDepth } from '../rendering/entityRenderer';
import { getActiveGrid } from '../state/gridData';
import { markOverlayDirty } from '../rendering/dirtyFlags';

/** An item in the eyedropper picker, entity, tile, or decal. */
export interface PickerItem {
  type: 'entity' | 'tile' | 'decal';
  id: string;        // prototype ID or tile ID
  label: string;     // display label
  /** For decals: the color to apply to the palette placement settings. */
  decalColor?: string | null;
}

export class EyedropperTool implements ITool {
  name = 'eyedropper';
  cursor = 'crosshair';

  // Picker state
  private pickerOpen = false;
  private pickerItems: PickerItem[] = [];
  private pickerIndex = 0;
  private pickerTileX = 0;
  private pickerTileY = 0;

  /** Build the combined list of pickable items at a tile (entities first, then decals, then tile). */
  private buildPickerItems(ctx: ToolContext, tileX: number, tileY: number): PickerItem[] {
    const { state } = ctx;
    const items: PickerItem[] = [];

    // Add entities (topmost first, filtered by layer visibility)
    if (state.registry) {
      const entities = getEntitiesAtTile(tileX, tileY, state.entities, state.registry);
      for (const entity of entities) {
        if (ctx.layerVisibility) {
          const depth = getCachedDrawDepth(entity.prototype, state.registry);
          if (!isLayerVisible(depth, entity.prototype, ctx.layerVisibility, state.registry)) continue;
        }
        items.push({ type: 'entity', id: entity.prototype, label: entity.prototype });
      }
    }

    // Add decals at this tile (only if decal layer visible)
    const activeGrid = getActiveGrid(state.grids, state.activeGridIndex);
    if (activeGrid?.decals && (!ctx.layerVisibility || ctx.layerVisibility.decals)) {
      for (const decal of activeGrid.decals.decals) {
        if (Math.floor(decal.position.x) === tileX && Math.floor(decal.position.y) === tileY) {
          const colorLabel = decal.color ? ` (${decal.color})` : '';
          items.push({
            type: 'decal',
            id: decal.prototypeId,
            label: `[D] ${decal.prototypeId}${colorLabel}`,
            decalColor: decal.color,
          });
        }
      }
    }

    // Add tile
    const cell = getCell(state.grid, tileX, tileY);
    if (cell && cell.tileId !== 'Space') {
      items.push({ type: 'tile', id: cell.tileId, label: `[Tile] ${cell.tileId}` });
    }

    return items;
  }

  /** Pick the currently selected item and switch to the appropriate tool. */
  private pickCurrent(ctx: ToolContext) {
    if (this.pickerItems.length === 0) return;
    const item = this.pickerItems[this.pickerIndex];
    ctx.dispatch({
      type: 'SET_PALETTE_ITEM',
      item: { type: item.type === 'decal' ? 'decal' : item.type, id: item.id },
    });
    if (item.type === 'decal') {
      // Apply the picked decal's color to placement settings
      if (item.decalColor !== undefined && ctx.setDecalColor) {
        ctx.setDecalColor(item.decalColor);
      }
      ctx.dispatch({ type: 'SET_TOOL', tool: 'paint' });
    } else {
      ctx.dispatch({ type: 'SET_TOOL', tool: item.type === 'entity' ? 'entityPlace' : 'paint' });
    }
  }

  onMouseDown(ctx: ToolContext, worldX: number, worldY: number, button: number) {
    if (button !== 0) return;

    if (this.pickerOpen) {
      // Picker is open, pick the currently highlighted item
      this.pickCurrent(ctx);
      this.closePicker();
      return;
    }

    // No picker, single-click picks the topmost item
    const tileX = Math.floor(worldX);
    const tileY = Math.floor(worldY);
    const items = this.buildPickerItems(ctx, tileX, tileY);
    if (items.length > 0) {
      this.pickerItems = items;
      this.pickerIndex = 0;
      this.pickCurrent(ctx);
    }
  }

  onMouseMove(_ctx: ToolContext, tileX: number, tileY: number) {
    // Close picker if cursor leaves the picker tile
    if (this.pickerOpen && (tileX !== this.pickerTileX || tileY !== this.pickerTileY)) {
      this.closePicker();
    }
  }

  onMouseUp() { }

  onWheel(ctx: ToolContext, tileX: number, tileY: number, deltaY: number): boolean {
    const floorX = Math.floor(tileX);
    const floorY = Math.floor(tileY);

    // Build or update picker items
    if (!this.pickerOpen || floorX !== this.pickerTileX || floorY !== this.pickerTileY) {
      const items = this.buildPickerItems(ctx, floorX, floorY);
      if (items.length < 2) return false; // Nothing to cycle through
      this.pickerItems = items;
      this.pickerIndex = 0;
      this.pickerTileX = floorX;
      this.pickerTileY = floorY;
      this.pickerOpen = true;
    }

    // Cycle through items
    if (deltaY > 0) {
      this.pickerIndex = (this.pickerIndex + 1) % this.pickerItems.length;
    } else {
      this.pickerIndex = (this.pickerIndex - 1 + this.pickerItems.length) % this.pickerItems.length;
    }

    markOverlayDirty();
    return true; // suppress zoom
  }

  private closePicker() {
    this.pickerOpen = false;
    this.pickerItems = [];
    this.pickerIndex = 0;
  }

  /** Expose picker state for testing. */
  getPickerState() {
    return {
      open: this.pickerOpen,
      items: this.pickerItems,
      index: this.pickerIndex,
      tileX: this.pickerTileX,
      tileY: this.pickerTileY,
    };
  }

  deactivate() {
    this.closePicker();
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

    canvasCtx.strokeStyle = '#ffff00';
    canvasCtx.lineWidth = 2;
    canvasCtx.setLineDash([4, 4]);
    canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
    canvasCtx.setLineDash([]);

    // Draw picker popup
    if (this.pickerOpen && this.pickerItems.length > 0) {
      const popupX = camera.worldToScreenX(this.pickerTileX + 1, canvasW) + 4;
      const popupY = camera.worldToScreenY(this.pickerTileY, canvasH);

      const rowHeight = 22;
      const padding = 6;
      const fontSize = 12;
      const popupWidth = 220;
      const popupHeight = this.pickerItems.length * rowHeight + padding * 2;

      // Background
      canvasCtx.fillStyle = 'rgba(26, 26, 46, 0.95)';
      canvasCtx.strokeStyle = 'rgba(42, 42, 74, 1)';
      canvasCtx.lineWidth = 1;
      canvasCtx.setLineDash([]);
      canvasCtx.beginPath();
      canvasCtx.roundRect(popupX, popupY, popupWidth, popupHeight, 4);
      canvasCtx.fill();
      canvasCtx.stroke();

      // Rows
      canvasCtx.font = `${fontSize}px monospace`;
      canvasCtx.textBaseline = 'middle';

      for (let i = 0; i < this.pickerItems.length; i++) {
        const item = this.pickerItems[i];
        const rowY = popupY + padding + i * rowHeight;

        // Highlight selected row
        if (i === this.pickerIndex) {
          canvasCtx.fillStyle = 'rgba(15, 52, 96, 0.9)';
          canvasCtx.fillRect(popupX + 2, rowY, popupWidth - 4, rowHeight);
        }

        // Index label
        canvasCtx.fillStyle = '#888';
        canvasCtx.textAlign = 'left';
        canvasCtx.fillText(`${i + 1}/${this.pickerItems.length}`, popupX + padding, rowY + rowHeight / 2);

        // Type indicator + name
        const typeTag = item.type === 'tile' ? '[T]' : item.type === 'decal' ? '[D]' : '[E]';
        const color = i === this.pickerIndex ? '#fff' : '#aaa';
        canvasCtx.fillStyle = item.type === 'tile' ? '#88cc88' : item.type === 'decal' ? '#cc88cc' : '#88aaff';
        canvasCtx.fillText(typeTag, popupX + 42, rowY + rowHeight / 2);
        canvasCtx.fillStyle = color;
        canvasCtx.fillText(item.id, popupX + 66, rowY + rowHeight / 2);
      }
    }
  }
}
