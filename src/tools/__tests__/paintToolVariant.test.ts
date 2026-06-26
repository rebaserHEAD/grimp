import { describe, it, expect } from 'vitest';
import { PaintTool } from '../paintTool';
import type { ToolContext } from '../toolTypes';
import { createInitialState, setCell, getCell, ensureGridContainsBounds } from '../../state/editorState';

/**
 * Regression test for stale tile variant bug.
 *
 * When painting a new tile type over an existing tile, the old tile's
 * variant/flags/rotationMirroring must NOT carry over to the new tile.
 * Stale variants can exceed the new tile's variant count, crashing the
 * SS14 MapRenderer's TilePainter.
 */
describe('PaintTool variant handling', () => {
  function makeToolContext(): { ctx: ToolContext; dispatched: any[] } {
    const state = createInitialState();
    // Expand grid to 16x16 so we have tiles to paint on
    state.grid = ensureGridContainsBounds(state.grid, 0, 0, 15, 15);
    state.grids[0].grid = state.grid;

    const dispatched: any[] = [];
    return {
      ctx: {
        state,
        dispatch: (action: any) => dispatched.push(action),
        camera: { tileScreenSize: 32 } as any,
        canvasW: 800,
        canvasH: 600,
        paletteItem: { type: 'tile', id: 'Plating' },
        shiftHeld: false,
        ctrlHeld: false,
      },
      dispatched,
    };
  }

  it('does not preserve old variant when painting a new tile type', () => {
    const { ctx } = makeToolContext();

    // Set up a cell with a non-zero variant (as if imported from a real map)
    setCell(ctx.state.grid, 5, 5, { tileId: 'FloorWood', variant: 4, flags: 1, rotationMirroring: 2 });

    // Verify the cell has the variant
    const before = getCell(ctx.state.grid, 5, 5);
    expect(before?.variant).toBe(4);
    expect(before?.flags).toBe(1);

    // Paint over it with Plating
    const tool = new PaintTool();
    tool.onMouseDown(ctx, 5, 5, 0);
    tool.onMouseUp(ctx);

    // Check the cell after painting
    const after = getCell(ctx.state.grid, 5, 5);
    expect(after?.tileId).toBe('Plating');
    // Variant should NOT be 4 (from FloorWood), it should be 0/undefined
    expect(after?.variant ?? 0).toBe(0);
    expect(after?.flags ?? 0).toBe(0);
    expect(after?.rotationMirroring ?? 0).toBe(0);
  });

  it('produces clean tile change records without stale variant', () => {
    const { ctx, dispatched } = makeToolContext();

    // Set up a cell with variant data
    setCell(ctx.state.grid, 3, 3, { tileId: 'FloorSteel', variant: 3 });

    // Paint and commit
    const tool = new PaintTool();
    tool.onMouseDown(ctx, 3, 3, 0);
    tool.onMouseUp(ctx);

    // The dispatched APPLY_COMMAND should have an 'after' cell without stale variant
    const applyCmd = dispatched.find(a => a.type === 'APPLY_COMMAND');
    expect(applyCmd).toBeDefined();
    const tileChange = applyCmd.command.tileChanges[0];
    expect(tileChange.after.tileId).toBe('Plating');
    expect(tileChange.after.variant).toBeUndefined();
    expect(tileChange.after.flags).toBeUndefined();

    // The 'before' should preserve the original for undo
    expect(tileChange.before.tileId).toBe('FloorSteel');
    expect(tileChange.before.variant).toBe(3);
  });
});
