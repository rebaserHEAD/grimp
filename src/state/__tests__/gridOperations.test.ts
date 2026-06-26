import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';

describe('grid operations undo/redo', () => {
  it('ADD_GRID appends a new empty grid', () => {
    const state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Shuttle' });
    expect(state.grids.length).toBe(2);
    expect(state.grids[1].name).toBe('Shuttle');
    expect(state.undoStack.length).toBe(1);
  });

  it('ADD_GRID clears redo stack', () => {
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'A' });
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.redoStack.length).toBe(1);
    state = editorReducer(state, { type: 'ADD_GRID', name: 'B' });
    expect(state.redoStack.length).toBe(0);
  });

  it('undo ADD_GRID removes the grid', () => {
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Shuttle' });
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.grids.length).toBe(1);
    expect(state.redoStack.length).toBe(1);
  });

  it('redo ADD_GRID re-adds the grid', () => {
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Shuttle' });
    state = editorReducer(state, { type: 'UNDO' });
    state = editorReducer(state, { type: 'REDO' });
    expect(state.grids.length).toBe(2);
    expect(state.grids[1].name).toBe('Shuttle');
  });

  it('REMOVE_GRID removes the grid and is undoable', () => {
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Shuttle' });
    const shuttleUid = state.grids[1].gridUid;
    state = editorReducer(state, { type: 'REMOVE_GRID', gridUid: shuttleUid });
    expect(state.grids.length).toBe(1);
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.grids.length).toBe(2);
    expect(state.grids[1].name).toBe('Shuttle');
  });

  it('REMOVE_GRID redo removes the grid again', () => {
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Shuttle' });
    const shuttleUid = state.grids[1].gridUid;
    state = editorReducer(state, { type: 'REMOVE_GRID', gridUid: shuttleUid });
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.grids.length).toBe(2);
    state = editorReducer(state, { type: 'REDO' });
    expect(state.grids.length).toBe(1);
  });

  it('RENAME_GRID changes name and is undoable', () => {
    const initial = createInitialState();
    const uid = initial.grids[0].gridUid;
    let state = editorReducer(initial, { type: 'RENAME_GRID', gridUid: uid, name: 'New Name' });
    expect(state.grids[0].name).toBe('New Name');
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.grids[0].name).toBe('Grid 1');
  });

  it('RENAME_GRID redo re-applies the new name', () => {
    const initial = createInitialState();
    const uid = initial.grids[0].gridUid;
    let state = editorReducer(initial, { type: 'RENAME_GRID', gridUid: uid, name: 'New Name' });
    state = editorReducer(state, { type: 'UNDO' });
    state = editorReducer(state, { type: 'REDO' });
    expect(state.grids[0].name).toBe('New Name');
  });

  it('cannot remove the last grid', () => {
    const state = createInitialState();
    const result = editorReducer(state, { type: 'REMOVE_GRID', gridUid: state.grids[0].gridUid });
    expect(result.grids.length).toBe(1);
  });

  it('REMOVE_GRID adjusts activeGridIndex when active grid deleted', () => {
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Shuttle' });
    state = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
    const shuttleUid = state.grids[1].gridUid;
    state = editorReducer(state, { type: 'REMOVE_GRID', gridUid: shuttleUid });
    expect(state.activeGridIndex).toBe(0);
  });

  it('undo REMOVE_GRID restores grid at original index', () => {
    // Create state with 3 grids, remove the middle one, undo
    let state = editorReducer(createInitialState(), { type: 'ADD_GRID', name: 'Middle' });
    state = editorReducer(state, { type: 'ADD_GRID', name: 'Last' });
    expect(state.grids.length).toBe(3);
    const middleUid = state.grids[1].gridUid;
    state = editorReducer(state, { type: 'REMOVE_GRID', gridUid: middleUid });
    expect(state.grids.length).toBe(2);
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.grids.length).toBe(3);
    expect(state.grids[1].name).toBe('Middle');
    expect(state.grids[1].gridUid).toBe(middleUid);
  });

  it('grid operations set dirty flag', () => {
    const initial = createInitialState();
    expect(initial.dirty).toBe(false);
    const afterAdd = editorReducer(initial, { type: 'ADD_GRID', name: 'X' });
    expect(afterAdd.dirty).toBe(true);
  });
});
