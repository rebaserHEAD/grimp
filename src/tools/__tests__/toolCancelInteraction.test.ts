import { describe, it, expect } from 'vitest';
import { PaintTool } from '../paintTool';
import { EraseTool } from '../eraseTool';
import { RectangleTool } from '../rectangleTool';
import { LineTool } from '../lineTool';
import { CircleTool } from '../circleTool';
import { CableDrawTool } from '../cableDrawTool';
import type { ToolContext } from '../toolTypes';
import { createInitialState, setCell, getCell, ensureGridContainsBounds } from '../../state/editorState';

/**
 * deactivate() is the tool-interaction cancel: it runs on tool switch (via
 * useToolLifecycle) and on Escape. For most tools cancelling means dropping
 * preview state, but paint and erase mutate the live grid DURING the stroke
 * and only become undoable when onMouseUp commits. Their deactivate therefore
 * has to revert the mutations; before it did, a mid-stroke cancel left the
 * painted tiles in the grid as silent, non-undoable edits.
 */
function makeToolContext(paletteItem: ToolContext['paletteItem'] = { type: 'tile', id: 'Plating' }) {
  const state = createInitialState();
  state.grid = ensureGridContainsBounds(state.grid, 0, 0, 15, 15);
  state.grids[0].grid = state.grid;

  const dispatched: { type: string }[] = [];
  const ctx: ToolContext = {
    state,
    dispatch: (action) => dispatched.push(action as { type: string }),
    camera: { tileScreenSize: 32 } as ToolContext['camera'],
    canvasW: 800,
    canvasH: 600,
    paletteItem,
    shiftHeld: false,
    ctrlHeld: false,
  };
  return { ctx, state, dispatched };
}

describe('paint stroke cancel', () => {
  it('reverts tiles painted during the stroke and dispatches nothing', () => {
    const { ctx, state, dispatched } = makeToolContext();
    setCell(state.grid, 4, 4, { tileId: 'FloorSteel', variant: 2 });

    const tool = new PaintTool();
    tool.onMouseDown(ctx, 4, 4, 0);
    tool.onMouseMove(ctx, 5, 4);
    tool.onMouseMove(ctx, 6, 4);
    expect(getCell(state.grid, 4, 4)?.tileId).toBe('Plating'); // live mutation mid-stroke

    tool.deactivate();

    expect(getCell(state.grid, 4, 4)?.tileId).toBe('FloorSteel');
    expect(getCell(state.grid, 4, 4)?.variant).toBe(2);
    expect(getCell(state.grid, 5, 4)?.tileId).toBe('Space');
    expect(getCell(state.grid, 6, 4)?.tileId).toBe('Space');
    expect(dispatched).toEqual([]);
  });

  it('restores the entity id counter when an entity stroke is cancelled', () => {
    const { ctx, state, dispatched } = makeToolContext({ type: 'entity', id: 'Firelock' });
    const idBefore = state.nextEntityId;

    const tool = new PaintTool();
    tool.onMouseDown(ctx, 2, 2, 0);
    tool.onMouseMove(ctx, 3, 2);
    expect(state.nextEntityId).toBeGreaterThan(idBefore); // counter consumed mid-stroke

    tool.deactivate();

    expect(state.nextEntityId).toBe(idBefore);
    expect(dispatched).toEqual([]);
  });

  it('a cancelled stroke does not leak into the next commit', () => {
    const { ctx, state, dispatched } = makeToolContext();

    const tool = new PaintTool();
    tool.onMouseDown(ctx, 4, 4, 0);
    tool.deactivate();

    tool.onMouseDown(ctx, 8, 8, 0);
    tool.onMouseUp(ctx);

    const cmd = dispatched.find((a) => a.type === 'APPLY_COMMAND') as
      { command: { tileChanges: { x: number; y: number }[] } } | undefined;
    expect(cmd).toBeDefined();
    expect(cmd!.command.tileChanges).toHaveLength(1);
    expect(cmd!.command.tileChanges[0]).toMatchObject({ x: 8, y: 8 });
    expect(getCell(state.grid, 4, 4)?.tileId).toBe('Space');
  });

  it('commit after an uninterrupted stroke is unchanged', () => {
    const { ctx, dispatched } = makeToolContext();
    const tool = new PaintTool();
    tool.onMouseDown(ctx, 1, 1, 0);
    tool.onMouseMove(ctx, 2, 1);
    tool.onMouseUp(ctx);
    const cmd = dispatched.find((a) => a.type === 'APPLY_COMMAND') as
      { command: { tileChanges: unknown[] } } | undefined;
    expect(cmd!.command.tileChanges).toHaveLength(2);
  });
});

describe('erase stroke cancel', () => {
  it('restores tiles blanked during the stroke and dispatches nothing', () => {
    const { ctx, state, dispatched } = makeToolContext(null);
    setCell(state.grid, 4, 4, { tileId: 'FloorSteel', variant: 1 });
    setCell(state.grid, 5, 4, { tileId: 'FloorWood' });

    const tool = new EraseTool();
    tool.onMouseDown(ctx, 4, 4, 0);
    tool.onMouseMove(ctx, 5, 4);
    expect(getCell(state.grid, 4, 4)?.tileId).toBe('Space'); // live blanking mid-stroke

    tool.deactivate();

    expect(getCell(state.grid, 4, 4)?.tileId).toBe('FloorSteel');
    expect(getCell(state.grid, 4, 4)?.variant).toBe(1);
    expect(getCell(state.grid, 5, 4)?.tileId).toBe('FloorWood');
    expect(dispatched).toEqual([]);
  });
});

describe('preview-only tools cancel cleanly', () => {
  it('rectangle: a drag cancelled by deactivate does not commit on a later mouseup', () => {
    const { ctx, dispatched } = makeToolContext();
    const tool = new RectangleTool();
    tool.onMouseDown(ctx, 1, 1, 0);
    tool.onMouseMove(ctx, 6, 6);
    tool.deactivate();
    tool.onMouseUp(ctx);
    expect(dispatched).toEqual([]);
  });

  it('line: same', () => {
    const { ctx, dispatched } = makeToolContext();
    const tool = new LineTool();
    tool.onMouseDown(ctx, 1, 1, 0);
    tool.onMouseMove(ctx, 6, 6);
    tool.deactivate();
    tool.onMouseUp(ctx);
    expect(dispatched).toEqual([]);
  });

  it('circle: same', () => {
    const { ctx, dispatched } = makeToolContext();
    const tool = new CircleTool();
    tool.onMouseDown(ctx, 4, 4, 0);
    tool.onMouseMove(ctx, 8, 4);
    tool.deactivate();
    tool.onMouseUp(ctx);
    expect(dispatched).toEqual([]);
  });

  it('cable: same, and the grid is untouched during the drag', () => {
    const { ctx, state, dispatched } = makeToolContext();
    const tool = new CableDrawTool();
    tool.onMouseDown(ctx, 1, 1, 0);
    tool.onMouseMove(ctx, 4, 1);
    expect(getCell(state.grid, 1, 1)?.tileId).toBe('Space'); // preview-only accumulation
    tool.deactivate();
    tool.onMouseUp(ctx);
    expect(dispatched).toEqual([]);
  });
});
