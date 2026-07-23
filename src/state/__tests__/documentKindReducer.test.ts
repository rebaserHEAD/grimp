import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';

/**
 * NEW_MAP / NEW_GRID document contracts. Both are born at format 7 with the
 * engine's meta.category discriminator (savemap → Map, savegrid → Grid).
 * Modern game saves omit postmapinit entirely, so new documents do too.
 */

describe('NEW_MAP', () => {
  it('creates a format 7 map document', () => {
    const state = editorReducer(createInitialState(), { type: 'NEW_MAP' });
    expect(state.meta.format).toBe(7);
    expect(state.meta.category).toBe('Map');
    expect(state.meta.postmapinit).toBeUndefined();
    expect(state.mapUid).toBe(0);
    expect(state.gridUid).toBe(1);
    expect(state.nextEntityId).toBe(2);
  });
});

describe('NEW_GRID', () => {
  it('creates a format 7 grid document with no map entity', () => {
    const state = editorReducer(createInitialState(), { type: 'NEW_GRID' });
    expect(state.meta.format).toBe(7);
    expect(state.meta.category).toBe('Grid');
    expect(state.meta.postmapinit).toBeUndefined();
    expect(state.mapUid).toBe(-1);
    expect(state.gridUid).toBe(1);
    expect(state.nextEntityId).toBe(2);
    expect(state.grids).toHaveLength(1);
    expect(state.structuralEntityData).toBeUndefined();
  });

  it('resets dirty tracking and undo history like NEW_MAP', () => {
    const seeded = editorReducer(createInitialState(), { type: 'NEW_GRID' });
    expect(seeded.dirty).toBe(false);
    expect(seeded.undoStack).toHaveLength(0);
    expect(seeded.redoStack).toHaveLength(0);
    expect(seeded.selectedEntityUids).toHaveLength(0);
  });
});
