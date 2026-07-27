import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';

/**
 * MARK_SAVED (#49): a successful Save / Save As clears the dirty flag so the
 * title bar and desktop close guard stop reporting unsaved changes. It must
 * not touch anything else (undo history survives a save).
 */

describe('MARK_SAVED', () => {
  it('clears the dirty flag without touching undo history', () => {
    let state = editorReducer(createInitialState(), { type: 'NEW_GRID' });
    state = editorReducer(state, { type: 'RENAME_GRID', gridUid: state.gridUid, name: 'Renamed' });
    expect(state.dirty).toBe(true);
    const undoDepth = state.undoStack.length;

    const saved = editorReducer(state, { type: 'MARK_SAVED' });
    expect(saved.dirty).toBe(false);
    expect(saved.undoStack).toHaveLength(undoDepth);
    expect(saved.grids).toBe(state.grids);
  });

  it('is a no-op on a clean document', () => {
    const state = editorReducer(createInitialState(), { type: 'NEW_MAP' });
    expect(state.dirty).toBe(false);
    expect(editorReducer(state, { type: 'MARK_SAVED' })).toBe(state);
  });
});
