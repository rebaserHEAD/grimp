import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SelectTool } from '../selectTool';
import type { ToolContext } from '../toolTypes';
import { createInitialState, setCell } from '../../state/editorState';
import type { EditorState } from '../../state/editorState';
import type { ImportedEntity } from '../../import/mapImporter';
import type { TileChange, EntityChange } from '../../types';
import { Camera } from '../../rendering/camera';
import { setClipboard, getClipboard } from '../../state/clipboard';
import * as dirtyFlags from '../../rendering/dirtyFlags';
import { rebuildSpatialIndex } from '../../rendering/spatialIndex';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

function makeGrid(width: number, height: number, offsetX = 0, offsetY = 0) {
  const cells = new Array(width * height);
  for (let i = 0; i < cells.length; i++) cells[i] = { tileId: 'Space' };
  return { width, height, offsetX, offsetY, cells };
}

function makeToolContext(
  overrides: Partial<EditorState> = {},
): { ctx: ToolContext; dispatched: any[] } {
  const dispatched: any[] = [];
  const state: EditorState = {
    ...createInitialState(),
    grid: makeGrid(20, 20, 0, 0),
    ...overrides,
  };
  const ctx: ToolContext = {
    state,
    dispatch: (action: any) => dispatched.push(action),
    camera: new Camera(),
    canvasW: 800,
    canvasH: 600,
    paletteItem: null,
    shiftHeld: false,
    ctrlHeld: false,
  };
  return { ctx, dispatched };
}

describe('SelectTool', () => {
  let tool: SelectTool;

  beforeEach(() => {
    tool = new SelectTool();
    // Reset clipboard between tests
    setClipboard(null as any);
    // Reset spatial index
    rebuildSpatialIndex([]);
  });

  describe('selection', () => {
    it('creates a selection rectangle via drag', () => {
      const { ctx } = makeToolContext();
      tool.onMouseDown(ctx, 2, 3, 0);
      tool.onMouseMove(ctx, 5, 6);
      tool.onMouseUp(ctx);
      // Phase should be 'selected', we can verify by trying copy
      // which only works if selected
    });
  });

  describe('copy with entities', () => {
    it('copies tiles and entities within selection', () => {
      const entities = [
        makeEntity(10, 'Wall', 3, 4),
        makeEntity(11, 'Door', 5, 5),
        makeEntity(12, 'APC', 10, 10), // outside selection
      ];
      rebuildSpatialIndex(entities);
      const { ctx } = makeToolContext({ entities, nextEntityId: 13 });

      // Set some tiles
      setCell(ctx.state.grid, 3, 4, { tileId: 'Plating' });
      setCell(ctx.state.grid, 4, 5, { tileId: 'FloorSteel' });

      // Select 3,3 to 6,6
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 6, 6);
      tool.onMouseUp(ctx);

      tool.copy(ctx);
      const clip = getClipboard();
      expect(clip).not.toBeNull();
      expect(clip!.width).toBe(4);
      expect(clip!.height).toBe(4);

      // Should have 2 entities (Wall at 3,4 and Door at 5,5), not the APC at 10,10
      expect(clip!.entities).toHaveLength(2);
      expect(clip!.entities.map(e => e.prototype).sort()).toEqual(['Door', 'Wall']);

      // Entity offsets should be relative to origin (3,3)
      const wall = clip!.entities.find(e => e.prototype === 'Wall')!;
      expect(wall.dx).toBeCloseTo(0.5); // 3.5 - 3 = 0.5
      expect(wall.dy).toBeCloseTo(1.5); // 4.5 - 3 = 1.5
    });
  });

  describe('delete with entities', () => {
    it('deletes tiles and entities in selection', () => {
      const entities = [
        makeEntity(10, 'Wall', 3, 4),
        makeEntity(11, 'APC', 10, 10), // outside
      ];
      rebuildSpatialIndex(entities);
      const { ctx, dispatched } = makeToolContext({ entities, nextEntityId: 12 });

      setCell(ctx.state.grid, 3, 4, { tileId: 'Plating' });

      // Select 2,2 to 5,5
      tool.onMouseDown(ctx, 2, 2, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);

      tool.deleteSelection(ctx);

      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0].command;
      // Should clear tile
      expect(cmd.tileChanges.length).toBeGreaterThan(0);
      expect(cmd.tileChanges.some((tc: TileChange) => tc.x === 3 && tc.y === 4)).toBe(true);
      // Should remove entity
      expect(cmd.entityChanges).toHaveLength(1);
      expect(cmd.entityChanges[0].action).toBe('remove');
      expect(cmd.entityChanges[0].entity.uid).toBe(10);
    });
  });

  describe('paste with entities', () => {
    it('pastes tiles and entities with new UIDs at target position', () => {
      const { ctx, dispatched } = makeToolContext({ nextEntityId: 100 });

      setClipboard({
        width: 3, height: 3,
        tiles: [
          { tileId: 'Plating' }, { tileId: 'Space' }, { tileId: 'Space' },
          { tileId: 'Space' }, { tileId: 'FloorSteel' }, { tileId: 'Space' },
          { tileId: 'Space' }, { tileId: 'Space' }, { tileId: 'Space' },
        ],
        entities: [
          { dx: 0.5, dy: 0.5, prototype: 'Wall', rotation: 0, components: [] },
          { dx: 1.5, dy: 1.5, prototype: 'Door', rotation: 1.57, components: [] },
        ],
        originX: 5, originY: 5,
      });

      tool.paste(ctx);

      // Move paste cursor to 10, 10
      tool.onMouseMove(ctx, 10, 10);
      // Commit
      tool.onMouseDown(ctx, 10, 10, 0);

      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0].command;

      // Should have tile changes
      expect(cmd.tileChanges.length).toBeGreaterThan(0);

      // Should have 2 entity adds with new UIDs starting at 100
      const adds = cmd.entityChanges.filter((ec: EntityChange) => ec.action === 'add');
      expect(adds).toHaveLength(2);
      expect(adds[0].entity.uid).toBe(100);
      expect(adds[1].entity.uid).toBe(101);

      // Check positions are offset to paste location
      const wall = adds.find((ec: EntityChange) => ec.entity.prototype === 'Wall')!;
      expect(wall.entity.position.x).toBeCloseTo(10.5);
      expect(wall.entity.position.y).toBeCloseTo(10.5);

      const door = adds.find((ec: EntityChange) => ec.entity.prototype === 'Door')!;
      expect(door.entity.position.x).toBeCloseTo(11.5);
      expect(door.entity.position.y).toBeCloseTo(11.5);
      expect(door.entity.rotation).toBeCloseTo(1.57);
    });
  });

  describe('move', () => {
    it('moves tiles and entities when dragging inside selection', () => {
      const entities = [
        makeEntity(10, 'Wall', 3, 3),
        makeEntity(11, 'Door', 4, 4),
        makeEntity(12, 'APC', 10, 10), // outside
      ];
      rebuildSpatialIndex(entities);
      const { ctx, dispatched } = makeToolContext({ entities, nextEntityId: 13 });

      setCell(ctx.state.grid, 3, 3, { tileId: 'Plating' });
      setCell(ctx.state.grid, 4, 4, { tileId: 'FloorSteel' });

      // Select 3,3 to 5,5
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);

      // Now click inside selection to start move
      tool.onMouseDown(ctx, 4, 4, 0);
      // Drag +2, +3
      tool.onMouseMove(ctx, 6, 7);
      tool.onMouseUp(ctx);

      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0].command;
      expect(cmd.label).toBe('Move selection');

      // Should have entity removes for the 2 selected entities
      const removes = cmd.entityChanges.filter((ec: EntityChange) => ec.action === 'remove');
      expect(removes).toHaveLength(2);
      expect(removes.map((r: EntityChange) => r.entity.uid).sort()).toEqual([10, 11]);

      // Should have entity adds at new positions
      const adds = cmd.entityChanges.filter((ec: EntityChange) => ec.action === 'add');
      expect(adds).toHaveLength(2);

      // Wall was at 3.5, 3.5, should now be at 5.5, 6.5 (moved +2, +3)
      const movedWall = adds.find((ec: EntityChange) => ec.entity.prototype === 'Wall')!;
      expect(movedWall.entity.position.x).toBeCloseTo(5.5);
      expect(movedWall.entity.position.y).toBeCloseTo(6.5);

      // Door was at 4.5, 4.5, should now be at 6.5, 7.5
      const movedDoor = adds.find((ec: EntityChange) => ec.entity.prototype === 'Door')!;
      expect(movedDoor.entity.position.x).toBeCloseTo(6.5);
      expect(movedDoor.entity.position.y).toBeCloseTo(7.5);
    });

    it('does not dispatch when move offset is zero', () => {
      const { ctx, dispatched } = makeToolContext();
      setCell(ctx.state.grid, 3, 3, { tileId: 'Plating' });

      // Select
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);

      // Click inside but don't move
      tool.onMouseDown(ctx, 4, 4, 0);
      tool.onMouseUp(ctx);

      expect(dispatched).toHaveLength(0);
    });

    it('clicking outside selection starts new selection', () => {
      const { ctx } = makeToolContext();

      // Select 3,3 to 5,5
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);

      // Click outside at 10,10
      tool.onMouseDown(ctx, 10, 10, 0);
      tool.onMouseMove(ctx, 12, 12);
      tool.onMouseUp(ctx);

      // Copy to check new selection bounds
      setCell(ctx.state.grid, 10, 10, { tileId: 'Plating' });
      tool.copy(ctx);
      const clip = getClipboard();
      expect(clip).not.toBeNull();
      expect(clip!.width).toBe(3);
      expect(clip!.height).toBe(3);
      expect(clip!.originX).toBe(10);
      expect(clip!.originY).toBe(10);
    });
  });

  describe('getContextMenuItems', () => {
    it('returns Copy/Cut/Delete/Save as Prefab when selected', () => {
      const { ctx } = makeToolContext();
      tool.onMouseDown(ctx, 2, 3, 0);
      tool.onMouseMove(ctx, 5, 6);
      tool.onMouseUp(ctx);
      const items = tool.getContextMenuItems(ctx, 3, 4);
      const labels = items.map(i => i.label);
      expect(labels).toContain('Copy');
      expect(labels).toContain('Cut');
      expect(labels).toContain('Delete');
      expect(labels).toContain('Save as Prefab...');
    });

    it('returns Paste when clipboard has data', () => {
      const { ctx } = makeToolContext();
      setClipboard({ width: 1, height: 1, tiles: [], entities: [], originX: 0, originY: 0 });
      const items = tool.getContextMenuItems(ctx, 0, 0);
      expect(items.map(i => i.label)).toContain('Paste');
    });

    it('returns empty array when idle and no clipboard', () => {
      const { ctx } = makeToolContext();
      const items = tool.getContextMenuItems(ctx, 0, 0);
      expect(items).toHaveLength(0);
    });
  });

  describe('cut with entities', () => {
    it('copies and then deletes tiles and entities', () => {
      const entities = [makeEntity(10, 'Wall', 3, 3)];
      rebuildSpatialIndex(entities);
      const { ctx, dispatched } = makeToolContext({ entities, nextEntityId: 11 });
      setCell(ctx.state.grid, 3, 3, { tileId: 'Plating' });

      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 4, 4);
      tool.onMouseUp(ctx);

      tool.cut(ctx);

      // Should have clipboard data with entity
      const clip = getClipboard();
      expect(clip!.entities).toHaveLength(1);

      // Should have dispatched delete command
      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0].command;
      expect(cmd.entityChanges).toHaveLength(1);
      expect(cmd.entityChanges[0].action).toBe('remove');
    });
  });

  describe('rotateSelection', () => {
    it('rotates a 6x4 selection CW to 4x6 dimensions', () => {
      const { ctx, dispatched } = makeToolContext({ nextEntityId: 100 });

      // Fill a 6x4 region with tiles
      for (let x = 0; x < 6; x++) {
        for (let y = 0; y < 4; y++) {
          setCell(ctx.state.grid, x, y, { tileId: 'FloorSteel' });
        }
      }

      // Select 0,0 to 5,3 (6 wide, 4 tall)
      tool.onMouseDown(ctx, 0, 0, 0);
      tool.onMouseMove(ctx, 5, 3);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'cw');

      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0].command;

      // All placed tiles should be within 4x6 bounds
      const placedTiles = cmd.tileChanges.filter(
        (tc: TileChange) => tc.after.tileId !== 'Space',
      );
      for (const tc of placedTiles) {
        expect(tc.x).toBeGreaterThanOrEqual(-1); // centered around original center
        expect(tc.x).toBeLessThanOrEqual(6);
        expect(tc.y).toBeGreaterThanOrEqual(-1);
        expect(tc.y).toBeLessThanOrEqual(6);
      }
      // Should have exactly 24 tiles placed (6*4)
      expect(placedTiles.length).toBe(24);
    });

    it('rotates tiles CW correctly in Y-up coordinates', () => {
      const { ctx, dispatched } = makeToolContext({ nextEntityId: 100 });

      // Place a distinctive L-shaped pattern:
      // y=1: X . .
      // y=0: X X X
      setCell(ctx.state.grid, 0, 0, { tileId: 'FloorSteel' });
      setCell(ctx.state.grid, 1, 0, { tileId: 'FloorSteel' });
      setCell(ctx.state.grid, 2, 0, { tileId: 'FloorSteel' });
      setCell(ctx.state.grid, 0, 1, { tileId: 'FloorSteel' });

      // Select 0,0 to 2,1 (3 wide, 2 tall)
      tool.onMouseDown(ctx, 0, 0, 0);
      tool.onMouseMove(ctx, 2, 1);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'cw');

      const cmd = dispatched[0].command;
      const placed = cmd.tileChanges
        .filter((tc: TileChange) => tc.after.tileId === 'FloorSteel')
        .map((tc: TileChange) => `${tc.x},${tc.y}`);

      // After CW rotation of L-shape in Y-up, the bottom row rotates to right column
      // and the top-left corner rotates to top-right.
      // New grid is 2 wide × 3 tall, centered around original center.
      // Original center: (1, 0.5). New dims: 2x3.
      // newMinX = round(1 - 0.5) = 1, newMinY = round(0.5 - 1) = 0
      // Expected CW result (2x3):
      //   y=2: .  X    (top-left was empty, top-right was the original top-left)
      //   y=1: .  X    (original bottom-left is now middle-right)
      //   y=0: X  X    (bottom of original becomes bottom of rotated)
      // Wait, let me compute manually with the fixed formula.
      // Original tiles at (dx,dy) relative to selection:
      //   (0,0), (1,0), (2,0), (0,1)
      // CW: newDx = dy, newDy = W-1-dx (W=3)
      //   (0,0) → (0, 2)
      //   (1,0) → (0, 1)
      //   (2,0) → (0, 0)
      //   (0,1) → (1, 2)
      // So rotated tiles at relative positions: (0,0), (0,1), (0,2), (1,2)
      // New grid: newW=2, newH=3
      // newMinX = round(1 - 0.5) = 1, newMinY = round(0.5 - 1) = 0
      // World positions: (1,0), (1,1), (1,2), (2,2)
      expect(placed).toContain('1,0');
      expect(placed).toContain('1,1');
      expect(placed).toContain('1,2');
      expect(placed).toContain('2,2');
      expect(placed).toHaveLength(4);
    });

    it('selection bounds match placed tile positions after rotation', () => {
      const { ctx, dispatched } = makeToolContext({ nextEntityId: 100 });

      // Fill a 6x4 region at non-zero origin
      for (let x = 3; x <= 8; x++) {
        for (let y = 5; y <= 8; y++) {
          setCell(ctx.state.grid, x, y, { tileId: 'FloorSteel' });
        }
      }

      // Select (3,5) to (8,8) = 6 wide, 4 tall
      tool.onMouseDown(ctx, 3, 5, 0);
      tool.onMouseMove(ctx, 8, 8);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'cw');

      const cmd = dispatched[0].command;
      const placed = cmd.tileChanges.filter(
        (tc: TileChange) => tc.after.tileId !== 'Space',
      );

      // Get the tool's internal selection bounds
      const toolAny = tool as any;
      const selMinX = toolAny.selMinX;
      const selMinY = toolAny.selMinY;
      const selMaxX = toolAny.selMaxX;
      const selMaxY = toolAny.selMaxY;
      const boundsW = selMaxX - selMinX + 1;
      const boundsH = selMaxY - selMinY + 1;

      // After CW rotation of 6x4, dimensions should be 4x6
      expect(boundsW).toBe(4);
      expect(boundsH).toBe(6);

      // ALL placed tiles must be within the selection bounds
      for (const tc of placed) {
        expect(tc.x).toBeGreaterThanOrEqual(selMinX);
        expect(tc.x).toBeLessThanOrEqual(selMaxX);
        expect(tc.y).toBeGreaterThanOrEqual(selMinY);
        expect(tc.y).toBeLessThanOrEqual(selMaxY);
      }

      // All cells within selection bounds should have a tile placed
      // (since the original was fully filled, the rotated should be too)
      expect(placed).toHaveLength(24); // 6*4 = 24
      for (let x = selMinX; x <= selMaxX; x++) {
        for (let y = selMinY; y <= selMaxY; y++) {
          expect(placed.some((tc: TileChange) => tc.x === x && tc.y === y))
            .toBe(true);
        }
      }
    });

    it('rotates entity positions CW to correct tile centers', () => {
      const entities = [
        makeEntity(10, 'Wall', 0, 0),  // position (0.5, 0.5), bottom-left
        makeEntity(11, 'Door', 2, 0),  // position (2.5, 0.5), bottom-right
      ];
      rebuildSpatialIndex(entities);
      const { ctx, dispatched } = makeToolContext({ entities, nextEntityId: 100 });

      setCell(ctx.state.grid, 0, 0, { tileId: 'Plating' });
      setCell(ctx.state.grid, 2, 0, { tileId: 'Plating' });

      // Select 0,0 to 2,1 (3 wide, 2 tall)
      tool.onMouseDown(ctx, 0, 0, 0);
      tool.onMouseMove(ctx, 2, 1);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'cw');

      const cmd = dispatched[0].command;
      const adds = cmd.entityChanges.filter((ec: EntityChange) => ec.action === 'add');
      expect(adds).toHaveLength(2);

      // Entity rotations should have -π/2 added (normalized to 3π/2)
      for (const add of adds) {
        expect(add.entity.rotation).toBeCloseTo(3 * Math.PI / 2);
      }

      // Verify entity positions land on correct tile centers.
      // Selection: 0,0 to 2,1 (W=3, H=2). Center: (1, 0.5).
      // After CW: newW=2, newH=3. newMinX=round(1-0.5)=1, newMinY=round(0.5-1)=0.
      //
      // CW entity mapping: newDx=dy, newDy=W-dx.
      // Wall (dx=0.5, dy=0.5): newDx=0.5, newDy=3-0.5=2.5 → world (1.5, 2.5)
      // Door (dx=2.5, dy=0.5): newDx=0.5, newDy=3-2.5=0.5 → world (1.5, 0.5)
      const wall = adds.find((ec: EntityChange) => ec.entity.prototype === 'Wall')!;
      expect(wall.entity.position.x).toBeCloseTo(1.5);
      expect(wall.entity.position.y).toBeCloseTo(2.5);

      const door = adds.find((ec: EntityChange) => ec.entity.prototype === 'Door')!;
      expect(door.entity.position.x).toBeCloseTo(1.5);
      expect(door.entity.position.y).toBeCloseTo(0.5);

      // Both entities must be within the selection bounds
      const toolAny = tool as any;
      for (const add of adds) {
        const tileX = Math.floor(add.entity.position.x);
        const tileY = Math.floor(add.entity.position.y);
        expect(tileX).toBeGreaterThanOrEqual(toolAny.selMinX);
        expect(tileX).toBeLessThanOrEqual(toolAny.selMaxX);
        expect(tileY).toBeGreaterThanOrEqual(toolAny.selMinY);
        expect(tileY).toBeLessThanOrEqual(toolAny.selMaxY);
      }
    });

    it('rotates CCW correctly (L-shape tile positions)', () => {
      const { ctx, dispatched } = makeToolContext({ nextEntityId: 100 });

      // Same L-shape as CW test:
      // y=1: X . .
      // y=0: X X X
      setCell(ctx.state.grid, 0, 0, { tileId: 'FloorSteel' });
      setCell(ctx.state.grid, 1, 0, { tileId: 'FloorSteel' });
      setCell(ctx.state.grid, 2, 0, { tileId: 'FloorSteel' });
      setCell(ctx.state.grid, 0, 1, { tileId: 'FloorSteel' });

      // Select 0,0 to 2,1 (3 wide, 2 tall)
      tool.onMouseDown(ctx, 0, 0, 0);
      tool.onMouseMove(ctx, 2, 1);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'ccw');

      const cmd = dispatched[0].command;
      const placed = cmd.tileChanges
        .filter((tc: TileChange) => tc.after.tileId === 'FloorSteel')
        .map((tc: TileChange) => `${tc.x},${tc.y}`);

      // CCW: (x,y) → (H-1-y, x) with H=2
      // Original tiles at (dx,dy): (0,0), (1,0), (2,0), (0,1)
      // CCW: (0,0)→(1,0), (1,0)→(1,1), (2,0)→(1,2), (0,1)→(0,0)
      // New grid: newW=2, newH=3
      // newMinX = round(1 - 0.5) = 1, newMinY = round(0.5 - 1) = 0
      // World: (1+0,0+0)=(1,0), (1+1,0+0)=(2,0), (1+1,0+1)=(2,1), (1+1,0+2)=(2,2)
      // Wait, let me recalculate: offsets (1,0), (1,1), (1,2), (0,0)
      // World: newMinX+dx, newMinY+dy = (1+1,0+0)=(2,0), (1+1,0+1)=(2,1), (1+1,0+2)=(2,2), (1+0,0+0)=(1,0)
      expect(placed).toContain('1,0');
      expect(placed).toContain('2,0');
      expect(placed).toContain('2,1');
      expect(placed).toContain('2,2');
      expect(placed).toHaveLength(4);
    });

    it('rotates entity positions CCW to correct tile centers', () => {
      const entities = [
        makeEntity(10, 'Wall', 0, 0),  // position (0.5, 0.5)
        makeEntity(11, 'Door', 2, 1),  // position (2.5, 1.5)
      ];
      rebuildSpatialIndex(entities);
      const { ctx, dispatched } = makeToolContext({ entities, nextEntityId: 100 });
      setCell(ctx.state.grid, 0, 0, { tileId: 'Plating' });
      setCell(ctx.state.grid, 2, 1, { tileId: 'Plating' });

      // Select 0,0 to 2,1 (W=3, H=2)
      tool.onMouseDown(ctx, 0, 0, 0);
      tool.onMouseMove(ctx, 2, 1);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'ccw');

      const cmd = dispatched[0].command;
      const adds = cmd.entityChanges.filter((ec: EntityChange) => ec.action === 'add');
      expect(adds).toHaveLength(2);

      // CCW: 0 + π/2 = π/2
      for (const add of adds) {
        expect(add.entity.rotation).toBeCloseTo(Math.PI / 2);
      }

      // CCW entity mapping: newDx=H-dy, newDy=dx. H=2.
      // Wall (dx=0.5, dy=0.5): newDx=2-0.5=1.5, newDy=0.5 → world (newMinX+1.5, newMinY+0.5)
      // Door (dx=2.5, dy=1.5): newDx=2-1.5=0.5, newDy=2.5 → world (newMinX+0.5, newMinY+2.5)
      const toolAny = tool as any;
      const wall = adds.find((ec: EntityChange) => ec.entity.prototype === 'Wall')!;
      expect(wall.entity.position.x).toBeCloseTo(toolAny.selMinX + 1.5);
      expect(wall.entity.position.y).toBeCloseTo(toolAny.selMinY + 0.5);

      const door = adds.find((ec: EntityChange) => ec.entity.prototype === 'Door')!;
      expect(door.entity.position.x).toBeCloseTo(toolAny.selMinX + 0.5);
      expect(door.entity.position.y).toBeCloseTo(toolAny.selMinY + 2.5);

      // Both entities must be within selection bounds
      for (const add of adds) {
        const tileX = Math.floor(add.entity.position.x);
        const tileY = Math.floor(add.entity.position.y);
        expect(tileX).toBeGreaterThanOrEqual(toolAny.selMinX);
        expect(tileX).toBeLessThanOrEqual(toolAny.selMaxX);
        expect(tileY).toBeGreaterThanOrEqual(toolAny.selMinY);
        expect(tileY).toBeLessThanOrEqual(toolAny.selMaxY);
      }
    });

    it('four CW rotations return selection to original state', () => {
      const { ctx, dispatched } = makeToolContext({ nextEntityId: 100 });

      // Place a 3x2 region
      for (let x = 5; x <= 7; x++) {
        for (let y = 5; y <= 6; y++) {
          setCell(ctx.state.grid, x, y, { tileId: 'FloorSteel' });
        }
      }

      // Select and rotate 4 times
      tool.onMouseDown(ctx, 5, 5, 0);
      tool.onMouseMove(ctx, 7, 6);
      tool.onMouseUp(ctx);

      for (let i = 0; i < 4; i++) {
        tool.rotateSelection(ctx, 'cw');
        // Apply tile changes to grid so next rotation reads them
        const cmd = dispatched[dispatched.length - 1].command;
        for (const tc of cmd.tileChanges) {
          setCell(ctx.state.grid, tc.x, tc.y, { ...tc.after });
        }
      }

      // After 4 rotations, bounds should match original (3 wide, 2 tall)
      const toolAny = tool as any;
      expect(toolAny.selMaxX - toolAny.selMinX + 1).toBe(3);
      expect(toolAny.selMaxY - toolAny.selMinY + 1).toBe(2);
    });

    it('entities remain within selection bounds after 4 CW rotations', () => {
      const entities = [
        makeEntity(10, 'APC', 5, 5),   // corner entity
        makeEntity(11, 'Door', 7, 6),  // off-center entity
      ];
      rebuildSpatialIndex(entities);
      const { ctx, dispatched } = makeToolContext({ entities, nextEntityId: 100 });

      for (let x = 5; x <= 7; x++) {
        for (let y = 5; y <= 6; y++) {
          setCell(ctx.state.grid, x, y, { tileId: 'FloorSteel' });
        }
      }

      tool.onMouseDown(ctx, 5, 5, 0);
      tool.onMouseMove(ctx, 7, 6);
      tool.onMouseUp(ctx);

      for (let i = 0; i < 4; i++) {
        tool.rotateSelection(ctx, 'cw');
        const cmd = dispatched[dispatched.length - 1].command;
        // Apply tile changes
        for (const tc of cmd.tileChanges) {
          setCell(ctx.state.grid, tc.x, tc.y, { ...tc.after });
        }
        // Apply entity changes to state so next rotation picks them up
        for (const ec of cmd.entityChanges) {
          if (ec.action === 'remove') {
            ctx.state.entities = ctx.state.entities.filter(e => e.uid !== ec.entity.uid);
          } else {
            ctx.state.entities.push(ec.entity);
          }
        }
        ctx.state.nextEntityId = Math.max(ctx.state.nextEntityId,
          ...ctx.state.entities.map(e => e.uid + 1));
        rebuildSpatialIndex(ctx.state.entities);

        // After each rotation, all entities must be within selection bounds
        const toolAny = tool as any;
        for (const e of ctx.state.entities) {
          const tileX = Math.floor(e.position.x);
          const tileY = Math.floor(e.position.y);
          expect(tileX).toBeGreaterThanOrEqual(toolAny.selMinX);
          expect(tileX).toBeLessThanOrEqual(toolAny.selMaxX);
          expect(tileY).toBeGreaterThanOrEqual(toolAny.selMinY);
          expect(tileY).toBeLessThanOrEqual(toolAny.selMaxY);
        }
      }
    });

    it('preserves spriteStateOverride through rotation', () => {
      const entity: ImportedEntity = {
        uid: 10, prototype: 'ClosetBase',
        position: { x: 3.5, y: 3.5 }, rotation: 0,
        components: [],
        spriteStateOverride: 'generic_open',
      };
      rebuildSpatialIndex([entity]);
      const { ctx, dispatched } = makeToolContext({ entities: [entity], nextEntityId: 100 });
      setCell(ctx.state.grid, 3, 3, { tileId: 'Plating' });

      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 3, 3);
      tool.onMouseUp(ctx);

      tool.rotateSelection(ctx, 'cw');

      const cmd = dispatched[0].command;
      const adds = cmd.entityChanges.filter((ec: EntityChange) => ec.action === 'add');
      expect(adds).toHaveLength(1);
      expect(adds[0].entity.spriteStateOverride).toBe('generic_open');
    });

    it('calls markOverlayDirty after in-place rotation', () => {
      const spy = vi.spyOn(dirtyFlags, 'markOverlayDirty');
      const { ctx } = makeToolContext({ nextEntityId: 100 });

      setCell(ctx.state.grid, 0, 0, { tileId: 'FloorSteel' });
      tool.onMouseDown(ctx, 0, 0, 0);
      tool.onMouseMove(ctx, 1, 1);
      tool.onMouseUp(ctx);

      spy.mockClear();
      tool.rotateSelection(ctx, 'cw');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('calls markOverlayDirty after paste rotation', () => {
      const spy = vi.spyOn(dirtyFlags, 'markOverlayDirty');
      const { ctx } = makeToolContext({ nextEntityId: 100 });

      setClipboard({
        width: 3, height: 2,
        tiles: new Array(6).fill({ tileId: 'FloorSteel' }),
        entities: [],
        originX: 0, originY: 0,
      });

      tool.paste(ctx);
      spy.mockClear();
      tool.rotateSelection(ctx, 'cw');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('rotates paste preview entities with correct positions', () => {
      const { ctx } = makeToolContext({ nextEntityId: 100 });

      setClipboard({
        width: 3, height: 2,
        tiles: new Array(6).fill({ tileId: 'FloorSteel' }),
        entities: [
          { dx: 0.5, dy: 0.5, prototype: 'Wall', rotation: 0, components: [] },
          { dx: 2.5, dy: 0.5, prototype: 'Door', rotation: 0, components: [] },
        ],
        originX: 0, originY: 0,
      });

      tool.paste(ctx);
      tool.rotateSelection(ctx, 'cw');

      // Commit the paste at position (5, 5)
      const dispatched: any[] = [];
      const ctx2: ToolContext = {
        ...ctx,
        dispatch: (a: any) => dispatched.push(a),
      };
      tool.onMouseMove(ctx2, 5, 5);
      tool.onMouseDown(ctx2, 5, 5, 0);

      expect(dispatched).toHaveLength(1);
      const adds = dispatched[0].command.entityChanges.filter(
        (ec: EntityChange) => ec.action === 'add',
      );
      expect(adds).toHaveLength(2);

      // CW entity mapping: (dx,dy) → (dy, W-dx) with W=3
      // Wall (0.5, 0.5) → (0.5, 2.5) → world (5.5, 7.5)
      // Door (2.5, 0.5) → (0.5, 0.5) → world (5.5, 5.5)
      const wall = adds.find((ec: EntityChange) => ec.entity.prototype === 'Wall')!;
      expect(wall.entity.position.x).toBeCloseTo(5.5);
      expect(wall.entity.position.y).toBeCloseTo(7.5);

      const door = adds.find((ec: EntityChange) => ec.entity.prototype === 'Door')!;
      expect(door.entity.position.x).toBeCloseTo(5.5);
      expect(door.entity.position.y).toBeCloseTo(5.5);

      // Entity rotations: 0 + (-π/2) normalized = 3π/2
      for (const add of adds) {
        expect(add.entity.rotation).toBeCloseTo(3 * Math.PI / 2);
      }

      // Verify entities are within the paste region (pasteX to pasteX+width-1, etc.)
      // After CW rotation: width=2, height=3. Paste at (5,5) → tiles at x:5-6, y:5-7
      for (const add of adds) {
        const tileX = Math.floor(add.entity.position.x);
        const tileY = Math.floor(add.entity.position.y);
        expect(tileX).toBeGreaterThanOrEqual(5);
        expect(tileX).toBeLessThanOrEqual(6);
        expect(tileY).toBeGreaterThanOrEqual(5);
        expect(tileY).toBeLessThanOrEqual(7);
      }
    });

    it('rotates paste preview without changing dimensions incorrectly', () => {
      const { ctx } = makeToolContext({ nextEntityId: 100 });

      setClipboard({
        width: 6, height: 4,
        tiles: new Array(24).fill({ tileId: 'FloorSteel' }),
        entities: [],
        originX: 0, originY: 0,
      });

      tool.paste(ctx);
      tool.rotateSelection(ctx, 'cw');

      const clip = getClipboard();
      // Clipboard shouldn't change, only pasteData changes
      expect(clip!.width).toBe(6);
      expect(clip!.height).toBe(4);

      // Verify paste data dimensions by doing copy after rotate
      // We can check indirectly by committing the paste and checking tile count
      // For now, just verify the paste commits with correct tile count
      const dispatched: any[] = [];
      const ctx2: ToolContext = {
        ...ctx,
        dispatch: (a: any) => dispatched.push(a),
      };
      tool.onMouseMove(ctx2, 0, 0);
      tool.onMouseDown(ctx2, 0, 0, 0);

      expect(dispatched).toHaveLength(1);
      const placed = dispatched[0].command.tileChanges.filter(
        (tc: TileChange) => tc.after.tileId === 'FloorSteel',
      );
      // 6x4 = 24 tiles should still be placed after rotation
      expect(placed).toHaveLength(24);

      // Verify the placed tiles span exactly 4 columns and 6 rows
      const xs = [...new Set(placed.map((tc: TileChange) => tc.x))].sort((a, b) => (a as number) - (b as number));
      const ys = [...new Set(placed.map((tc: TileChange) => tc.y))].sort((a, b) => (a as number) - (b as number));
      expect(xs).toHaveLength(4);  // 4 wide after rotation
      expect(ys).toHaveLength(6);  // 6 tall after rotation
    });
  });

  describe('additive/subtractive selection', () => {
    it('shift+box adds tiles to existing selection', () => {
      const tool = new SelectTool();
      const { ctx } = makeToolContext();

      // First box: (3,3)-(5,5) = 9 tiles
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);
      expect(tool.getSelectedTileCount()).toBe(9);

      // Shift+box: (7,7)-(9,9) = 9 more tiles
      ctx.shiftHeld = true;
      tool.onMouseDown(ctx, 7, 7, 0);
      tool.onMouseMove(ctx, 9, 9);
      tool.onMouseUp(ctx);
      ctx.shiftHeld = false;

      expect(tool.getSelectedTileCount()).toBe(18);
    });

    it('ctrl+box removes tiles from selection', () => {
      const tool = new SelectTool();
      const { ctx } = makeToolContext();

      // Select (3,3)-(9,9) = 49 tiles
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 9, 9);
      tool.onMouseUp(ctx);
      expect(tool.getSelectedTileCount()).toBe(49);

      // Ctrl+box: remove (5,5)-(7,7) = 9 tiles
      ctx.ctrlHeld = true;
      tool.onMouseDown(ctx, 5, 5, 0);
      tool.onMouseMove(ctx, 7, 7);
      tool.onMouseUp(ctx);
      ctx.ctrlHeld = false;

      expect(tool.getSelectedTileCount()).toBe(40);
    });

    it('replace mode clears previous selection', () => {
      const tool = new SelectTool();
      const { ctx } = makeToolContext();

      // Select (3,3)-(5,5)
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);
      expect(tool.getSelectedTileCount()).toBe(9);

      // New selection without modifier: (7,7)-(8,8)
      tool.onMouseDown(ctx, 7, 7, 0);
      tool.onMouseMove(ctx, 8, 8);
      tool.onMouseUp(ctx);
      expect(tool.getSelectedTileCount()).toBe(4);
    });

    it('subtracting all tiles returns to idle', () => {
      const tool = new SelectTool();
      const { ctx } = makeToolContext();

      // Select (3,3)-(5,5)
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);

      // Ctrl+box the same area
      ctx.ctrlHeld = true;
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 5, 5);
      tool.onMouseUp(ctx);
      ctx.ctrlHeld = false;

      expect(tool.getSelectedTileCount()).toBe(0);
    });
  });

  describe('spriteStateOverride preservation', () => {
    it('preserves spriteStateOverride through copy and paste', () => {
      const entity: ImportedEntity = {
        uid: 10, prototype: 'ClosetBase',
        position: { x: 3.5, y: 3.5 }, rotation: 0,
        components: [{ type: 'Transform', pos: '3.5,3.5', parent: 1 }],
        spriteStateOverride: 'generic_open',
      };
      rebuildSpatialIndex([entity]);
      const { ctx, dispatched } = makeToolContext({ entities: [entity], nextEntityId: 100 });
      setCell(ctx.state.grid, 3, 3, { tileId: 'Plating' });

      // Select
      tool.onMouseDown(ctx, 3, 3, 0);
      tool.onMouseMove(ctx, 3, 3);
      tool.onMouseUp(ctx);

      // Copy
      tool.copy(ctx);
      const clip = getClipboard();
      expect(clip!.entities[0].spriteStateOverride).toBe('generic_open');

      // Paste
      tool.paste(ctx);
      tool.onMouseDown(ctx, 8, 8, 0);

      expect(dispatched).toHaveLength(1);
      const adds = dispatched[0].command.entityChanges.filter(
        (ec: EntityChange) => ec.action === 'add',
      );
      expect(adds[0].entity.spriteStateOverride).toBe('generic_open');
    });
  });
});
