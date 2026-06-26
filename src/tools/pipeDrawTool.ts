import type { ITool, ToolContext } from './toolTypes';
import type { ImportedEntity } from '../import/mapImporter';
import type { PipeType } from '../types';
import { PIPE_COLORS, PIPE_DISPLAY } from '../types';
import { computePipeChanges, fitPipes, type PipeFamily } from '../algorithms/pipeFittings';
import { buildTransformComponent } from './entityHelpers';

/** Pipe prototypes that belong to gas pipe network */
const GAS_PIPE_PROTOTYPES = new Set([
  'GasPipeStraight', 'GasPipeBend', 'GasPipeTJunction', 'GasPipeFourway', 'GasPipeHalf',
  'GasPipeStraightAlt1', 'GasPipeBendAlt1', 'GasPipeTJunctionAlt1', 'GasPipeFourwayAlt1',
  'GasPipeStraightAlt2', 'GasPipeBendAlt2', 'GasPipeTJunctionAlt2', 'GasPipeFourwayAlt2',
]);

/** Pipe prototypes that belong to disposal network */
const DISPOSAL_PIPE_PROTOTYPES = new Set([
  'DisposalPipe', 'DisposalBend', 'DisposalJunction', 'DisposalYJunction',
  'DisposalJunctionFlipped', 'DisposalTrunk',
]);

/**
 * Pipe draw tool, drag to lay pipe paths with auto-fitting on commit.
 *
 * On mouseup, collects existing pipe entities of the same network,
 * merges with new tile positions, runs the fitting algorithm on
 * affected tiles, and dispatches a command that removes old fittings
 * and adds new correctly-fitted ones.
 */
export class PipeDrawTool implements ITool {
  name = 'pipeDraw';
  cursor = 'crosshair';

  /** Set externally from infrastructure panel selection */
  pipeType: PipeType = 'supply';

  private drawing = false;
  private visitedTiles: { x: number; y: number }[] = [];
  private visitedSet = new Set<string>();

  private get family(): PipeFamily {
    return this.pipeType === 'disposal' ? 'disposal' : 'gas';
  }

  private get color(): string | undefined {
    if (this.pipeType === 'supply') return PIPE_COLORS.supply;
    if (this.pipeType === 'return') return PIPE_COLORS.return;
    return undefined;
  }

  private get prototypeSet(): Set<string> {
    return this.family === 'gas' ? GAS_PIPE_PROTOTYPES : DISPOSAL_PIPE_PROTOTYPES;
  }

  onMouseDown(ctx: ToolContext, tileX: number, tileY: number, button: number) {
    if (button === 2) {
      this.erasePipeAt(ctx, tileX, tileY);
      return;
    }
    if (button !== 0) return;
    this.drawing = true;
    this.visitedTiles = [];
    this.visitedSet.clear();
    this.hasLastTile = false;
    this.addTile(tileX, tileY);
  }

  onMouseMove(_ctx: ToolContext, tileX: number, tileY: number) {
    if (!this.drawing) return;
    this.addTile(tileX, tileY);
  }

  onMouseUp(ctx: ToolContext) {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.visitedTiles.length === 0) return;

    // Collect existing pipe entities of the same network type
    // For gas pipes, also filter by color to separate supply/return networks
    const existingPipes = this.getMatchingPipeEntities(ctx);

    const { removedUids, fittedPipes } = computePipeChanges(
      this.visitedTiles,
      existingPipes.map(e => ({
        uid: e.uid,
        x: Math.floor(e.position.x),
        y: Math.floor(e.position.y),
      })),
      this.family,
      this.color,
    );

    // Build entity changes
    const entityChanges: { action: 'add' | 'remove'; entity: ImportedEntity }[] = [];

    // Remove old entities that are being refitted
    for (const uid of removedUids) {
      const entity = ctx.state.entities.find(e => e.uid === uid);
      if (entity) {
        entityChanges.push({ action: 'remove', entity });
      }
    }

    // Add new fitted entities
    let nextUid = ctx.state.nextEntityId;
    const gridUid = ctx.state.gridUid;
    for (const pipe of fittedPipes) {
      const pos = { x: pipe.x + 0.5, y: pipe.y + 0.5 };
      const components: Record<string, unknown>[] = buildTransformComponent(pos, pipe.rotation, gridUid);
      if (pipe.color) {
        components.push({ type: 'AtmosPipeColor', color: pipe.color });
      }
      const entity: ImportedEntity = {
        uid: nextUid++,
        prototype: pipe.prototype,
        position: pos,
        rotation: pipe.rotation,
        components,
      };
      entityChanges.push({ action: 'add', entity });
    }

    if (entityChanges.length > 0) {
      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: {
          label: `Draw ${PIPE_DISPLAY[this.pipeType].label}`,
          tileChanges: [],
          entityChanges,
        },
      });
    }

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
    const color = PIPE_DISPLAY[this.pipeType].color;

    // Draw pending tiles during drag
    if (this.drawing) {
      canvasCtx.fillStyle = color + '44';
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

  private addTile(x: number, y: number) {
    if (this.hasLastTile) {
      // Bresenham line interpolation to fill gaps from fast mouse movement
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

  /** Fill in skipped tiles between last position and (toX, toY). */
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
      // Don't add the final tile, addTile will add it
      if (x0 === toX && y0 === toY) break;
      this.addSingleTile(x0, y0);
    }
  }

  /**
   * Get existing pipe entities that belong to the same network.
   * For gas pipes, separates supply/return by AtmosPipeColor.
   */
  private getMatchingPipeEntities(ctx: ToolContext): ImportedEntity[] {
    const protos = this.prototypeSet;
    return ctx.state.entities.filter(e => {
      if (!protos.has(e.prototype)) return false;
      if (this.family === 'disposal') return true;

      // For gas pipes, match by color
      const entityColor = this.getEntityPipeColor(e);
      return entityColor === (this.color ?? null);
    });
  }

  private getEntityPipeColor(entity: ImportedEntity): string | null {
    for (const comp of entity.components) {
      const c = comp as Record<string, unknown>;
      if (c.type === 'AtmosPipeColor' && typeof c.color === 'string') {
        return c.color;
      }
    }
    return null;
  }

  private erasePipeAt(ctx: ToolContext, tileX: number, tileY: number) {
    const protos = this.prototypeSet;
    const toRemove = ctx.state.entities.filter(e =>
      protos.has(e.prototype) &&
      Math.floor(e.position.x) === tileX &&
      Math.floor(e.position.y) === tileY,
    );
    if (toRemove.length === 0) return;

    // After removing, refit neighbors
    const remainingPipes = this.getMatchingPipeEntities(ctx)
      .filter(e => !toRemove.some(r => r.uid === e.uid));

    // Find neighbor positions that need refitting
    const entityChanges: { action: 'add' | 'remove'; entity: ImportedEntity }[] = [];
    for (const e of toRemove) {
      entityChanges.push({ action: 'remove', entity: e });
    }

    // Refit adjacent existing pipes
    const neighbors = new Set<string>();
    for (const e of toRemove) {
      const ex = Math.floor(e.position.x);
      const ey = Math.floor(e.position.y);
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        neighbors.add(`${ex + dx},${ey + dy}`);
      }
    }

    // Build tile set of remaining pipes
    const allRemainingTiles = new Set<string>();
    for (const e of remainingPipes) {
      allRemainingTiles.add(`${Math.floor(e.position.x)},${Math.floor(e.position.y)}`);
    }

    if (allRemainingTiles.size > 0) {
      const allFitted = fitPipes(allRemainingTiles, this.family, this.color);

      // Only refit tiles that are neighbors of removed tiles
      let nextUid = ctx.state.nextEntityId;
      for (const pipe of allFitted) {
        const key = `${pipe.x},${pipe.y}`;
        if (!neighbors.has(key)) continue;

        // Remove old entity at this position
        const oldEntity = remainingPipes.find(e =>
          Math.floor(e.position.x) === pipe.x && Math.floor(e.position.y) === pipe.y,
        );
        if (oldEntity) {
          entityChanges.push({ action: 'remove', entity: oldEntity });
        }

        // Add new fitted entity
        const refitPos = { x: pipe.x + 0.5, y: pipe.y + 0.5 };
        const refitComps: Record<string, unknown>[] = buildTransformComponent(refitPos, pipe.rotation, ctx.state.gridUid);
        if (pipe.color) {
          refitComps.push({ type: 'AtmosPipeColor', color: pipe.color });
        }
        entityChanges.push({
          action: 'add',
          entity: {
            uid: nextUid++,
            prototype: pipe.prototype,
            position: refitPos,
            rotation: pipe.rotation,
            components: refitComps,
          },
        });
      }
    }

    if (entityChanges.length > 0) {
      ctx.dispatch({
        type: 'APPLY_COMMAND',
        command: {
          label: `Erase ${PIPE_DISPLAY[this.pipeType].label}`,
          tileChanges: [],
          entityChanges,
        },
      });
    }
  }
}
