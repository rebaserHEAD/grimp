import type { ITool, ToolContext } from './toolTypes';
import type { ImportedEntity } from '../import/mapImporter';
import type { CableType } from '../types';
import { CABLE_DISPLAY } from '../types';
import { buildTransformComponent } from './entityHelpers';

/**
 * Cable draw tool, drag to lay cable entities one per tile.
 *
 * Cables in SS14 don't need rotation or fitting, the engine auto-connects
 * adjacent cables with matching nodeGroupID. We just place one entity per tile.
 */
export class CableDrawTool implements ITool {
  name = 'cableDraw';
  cursor = 'crosshair';

  /** Set externally from infrastructure panel selection */
  cableType: CableType = 'CableHV';

  private drawing = false;
  private visitedTiles: { x: number; y: number }[] = [];
  private visitedSet = new Set<string>();

  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button === 2) {
      // Right-click erases cable at tile
      this.eraseCableAt(ctx, tileX, tileY);
      return;
    }
    if (button !== 0) return;
    this.drawing = true;
    this.visitedTiles = [];
    this.visitedSet.clear();
    this.hasLastTile = false;
    this.addTile(ctx, tileX, tileY);
  }

  onMouseMove(ctx: ToolContext, tileX: number, tileY: number) {
    if (!this.drawing) return;
    this.addTile(ctx, tileX, tileY);
  }

  onMouseUp(ctx: ToolContext) {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.visitedTiles.length === 0) return;

    // Filter out tiles that already have this cable type
    const existingPositions = new Set<string>();
    for (const e of ctx.state.entities) {
      if (e.prototype === this.cableType) {
        existingPositions.add(`${Math.floor(e.position.x)},${Math.floor(e.position.y)}`);
      }
    }

    const newTiles = this.visitedTiles.filter(t => !existingPositions.has(`${t.x},${t.y}`));
    if (newTiles.length === 0) return;

    let nextUid = ctx.state.nextEntityId;
    const gridUid = ctx.state.gridUid;
    const entities: ImportedEntity[] = newTiles.map(t => {
      const pos = { x: t.x + 0.5, y: t.y + 0.5 };
      return {
        uid: nextUid++,
        prototype: this.cableType,
        position: pos,
        rotation: 0,
        components: buildTransformComponent(pos, 0, gridUid),
      };
    });

    ctx.dispatch({
      type: 'APPLY_COMMAND',
      command: {
        label: `Draw ${CABLE_DISPLAY[this.cableType].label}`,
        tileChanges: [],
        entityChanges: entities.map(e => ({ action: 'add' as const, entity: e })),
      },
    });

    this.visitedTiles = [];
    this.visitedSet.clear();
  }

  renderPreview(
    canvasCtx: CanvasRenderingContext2D,
    toolCtx: ToolContext,
    cursorTileX: number,
    cursorTileY: number,
  ) {
    const { camera, canvasW, canvasH } = toolCtx;
    const tileScreenSize = camera.tileScreenSize;
    const color = CABLE_DISPLAY[this.cableType].color;

    // Draw pending tiles during drag
    if (this.drawing) {
      canvasCtx.fillStyle = color + '44'; // semi-transparent
      canvasCtx.strokeStyle = color;
      canvasCtx.lineWidth = 1;
      for (const t of this.visitedTiles) {
        const sx = camera.worldToScreenX(t.x, canvasW);
        const sy = camera.worldToScreenY(t.y, canvasH);
        canvasCtx.fillRect(sx, sy, tileScreenSize, tileScreenSize);
        canvasCtx.strokeRect(sx, sy, tileScreenSize, tileScreenSize);
      }
    }

    // Cursor preview
    const drawX = camera.worldToScreenX(cursorTileX, canvasW);
    const drawY = camera.worldToScreenY(cursorTileY, canvasH);
    canvasCtx.strokeStyle = color;
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(drawX, drawY, tileScreenSize, tileScreenSize);
  }

  deactivate() {
    this.drawing = false;
    this.visitedTiles = [];
    this.visitedSet.clear();
    this.hasLastTile = false;
  }

  private lastTileX = 0;
  private lastTileY = 0;
  private hasLastTile = false;

  private addTile(_ctx: ToolContext, x: number, y: number) {
    if (this.hasLastTile) {
      this.interpolateTo(x, y);
    }
    this.addSingleTile(x, y);
    this.lastTileX = x;
    this.lastTileY = y;
    this.hasLastTile = true;
  }

  private addSingleTile(x: number, y: number) {
    const key = `${x},${y}`;
    if (this.visitedSet.has(key)) return;
    this.visitedSet.add(key);
    this.visitedTiles.push({ x, y });
  }

  /** Bresenham line interpolation to fill gaps from fast mouse movement. */
  private interpolateTo(toX: number, toY: number) {
    let x0 = this.lastTileX;
    let y0 = this.lastTileY;
    const dx = Math.abs(toX - x0);
    const dy = Math.abs(toY - y0);
    const sx = x0 < toX ? 1 : -1;
    const sy = y0 < toY ? 1 : -1;
    let err = dx - dy;

    while (x0 !== toX || y0 !== toY) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      if (x0 === toX && y0 === toY) break;
      this.addSingleTile(x0, y0);
    }
  }

  private eraseCableAt(ctx: ToolContext, tileX: number, tileY: number) {
    const toRemove = ctx.state.entities.filter(e =>
      e.prototype === this.cableType &&
      Math.floor(e.position.x) === tileX &&
      Math.floor(e.position.y) === tileY,
    );
    if (toRemove.length === 0) return;

    ctx.dispatch({
      type: 'APPLY_COMMAND',
      command: {
        label: `Erase ${CABLE_DISPLAY[this.cableType].label}`,
        tileChanges: [],
        entityChanges: toRemove.map(e => ({ action: 'remove' as const, entity: e })),
      },
    });
  }
}
