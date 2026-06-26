import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';
import type { DecalInstance } from '../../import/decalParser';
import type { Command } from '../../types';

function makeDecal(id: number, proto: string, x: number, y: number): DecalInstance {
  return { id, prototypeId: proto, position: { x, y }, color: null, angle: 0, zIndex: 0, cleanable: false };
}

function addDecalCommand(decal: DecalInstance): Command {
  return {
    label: 'Add decal',
    tileChanges: [],
    entityChanges: [],
    decalChanges: [{ action: 'add', decal }],
  };
}

function removeDecalCommand(decal: DecalInstance): Command {
  return {
    label: 'Remove decal',
    tileChanges: [],
    entityChanges: [],
    decalChanges: [{ action: 'remove', decal }],
  };
}

function updateDecalCommand(decal: DecalInstance, previousDecal: DecalInstance): Command {
  return {
    label: 'Update decal',
    tileChanges: [],
    entityChanges: [],
    decalChanges: [{ action: 'update', decal, previousDecal }],
  };
}

describe('Decal mutations via APPLY_COMMAND', () => {
  it('adds a decal to the active grid', () => {
    const state = createInitialState();
    const decal = makeDecal(0, 'BrickTileWhite', 3, 5);
    const next = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });

    const grid = next.grids[next.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(1);
    expect(grid.decals.decals[0]).toEqual(decal);
    expect(grid.decals.nextDecalId).toBe(1);
  });

  it('increments nextDecalId when adding a decal with higher id', () => {
    const state = createInitialState();
    const decal = makeDecal(10, 'BrickTileWhite', 0, 0);
    const next = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });

    const grid = next.grids[next.activeGridIndex];
    expect(grid.decals.nextDecalId).toBe(11);
  });

  it('removes a decal from the grid', () => {
    let state = createInitialState();
    const decal = makeDecal(0, 'BrickTileWhite', 3, 5);
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: removeDecalCommand(decal) });

    const grid = state.grids[state.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(0);
  });

  it('updates a decal\'s properties', () => {
    let state = createInitialState();
    const original = makeDecal(0, 'BrickTileWhite', 3, 5);
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(original) });

    const updated = { ...original, color: '#FF0000FF', angle: 1.57 };
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: updateDecalCommand(updated, original) });

    const grid = state.grids[state.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(1);
    expect(grid.decals.decals[0].color).toBe('#FF0000FF');
    expect(grid.decals.decals[0].angle).toBe(1.57);
  });

  it('undo reverses add (decal removed)', () => {
    let state = createInitialState();
    const decal = makeDecal(0, 'BrickTileWhite', 3, 5);
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });
    state = editorReducer(state, { type: 'UNDO' });

    const grid = state.grids[state.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(0);
  });

  it('undo reverses remove (decal restored)', () => {
    let state = createInitialState();
    const decal = makeDecal(0, 'BrickTileWhite', 3, 5);
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: removeDecalCommand(decal) });
    state = editorReducer(state, { type: 'UNDO' });

    const grid = state.grids[state.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(1);
    expect(grid.decals.decals[0]).toEqual(decal);
  });

  it('undo reverses update (properties reverted)', () => {
    let state = createInitialState();
    const original = makeDecal(0, 'BrickTileWhite', 3, 5);
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(original) });

    const updated = { ...original, color: '#FF0000FF', angle: 1.57 };
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: updateDecalCommand(updated, original) });
    state = editorReducer(state, { type: 'UNDO' });

    const grid = state.grids[state.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(1);
    expect(grid.decals.decals[0].color).toBeNull();
    expect(grid.decals.decals[0].angle).toBe(0);
  });

  it('adds grid UID to decalsDirty on any decal change', () => {
    const state = createInitialState();
    const decal = makeDecal(0, 'BrickTileWhite', 3, 5);
    const next = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });

    const gridUid = next.grids[next.activeGridIndex].gridUid;
    expect(next.decalsDirty.has(gridUid)).toBe(true);
  });

  it('redo after undo re-applies the change', () => {
    let state = createInitialState();
    const decal = makeDecal(0, 'BrickTileWhite', 3, 5);
    state = editorReducer(state, { type: 'APPLY_COMMAND', command: addDecalCommand(decal) });
    state = editorReducer(state, { type: 'UNDO' });
    state = editorReducer(state, { type: 'REDO' });

    const grid = state.grids[state.activeGridIndex];
    expect(grid.decals.decals).toHaveLength(1);
    expect(grid.decals.decals[0]).toEqual(decal);
  });
});

describe('Decal selection actions', () => {
  it('SELECT_DECAL replaces selection', () => {
    let state = createInitialState();
    state = editorReducer(state, { type: 'SELECT_DECAL', ids: [1, 2, 3] });
    expect(state.selectedDecalIds).toEqual([1, 2, 3]);

    state = editorReducer(state, { type: 'SELECT_DECAL', ids: [5] });
    expect(state.selectedDecalIds).toEqual([5]);
  });

  it('TOGGLE_SELECT_DECAL adds if not present, removes if present', () => {
    let state = createInitialState();
    state = editorReducer(state, { type: 'TOGGLE_SELECT_DECAL', id: 1 });
    expect(state.selectedDecalIds).toEqual([1]);

    state = editorReducer(state, { type: 'TOGGLE_SELECT_DECAL', id: 2 });
    expect(state.selectedDecalIds).toEqual([1, 2]);

    state = editorReducer(state, { type: 'TOGGLE_SELECT_DECAL', id: 1 });
    expect(state.selectedDecalIds).toEqual([2]);
  });

  it('ADD_SELECT_DECALS adds without duplicates', () => {
    let state = createInitialState();
    state = editorReducer(state, { type: 'SELECT_DECAL', ids: [1, 2] });
    state = editorReducer(state, { type: 'ADD_SELECT_DECALS', ids: [2, 3, 4] });
    expect(state.selectedDecalIds).toEqual([1, 2, 3, 4]);
  });

  it('REMOVE_SELECT_DECALS removes specified', () => {
    let state = createInitialState();
    state = editorReducer(state, { type: 'SELECT_DECAL', ids: [1, 2, 3, 4] });
    state = editorReducer(state, { type: 'REMOVE_SELECT_DECALS', ids: [2, 4] });
    expect(state.selectedDecalIds).toEqual([1, 3]);
  });
});
