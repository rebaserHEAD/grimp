import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';
import type { EditorState } from '../editorState';
import type { ImportedEntity } from '../../import/mapImporter';
import type { Command } from '../../types';
import type { GridData } from '../gridData';
import { rebuildSpatialIndex, spatialSize, spatialGetByUid } from '../../rendering/spatialIndex';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

function syncGrids(state: EditorState): EditorState {
  const activeGrid = state.grids[state.activeGridIndex];
  const updated: GridData = { ...activeGrid, grid: state.grid, entities: state.entities, containedEntities: state.containedEntities };
  return { ...state, grids: state.grids.map((g, i) => i === state.activeGridIndex ? updated : g) };
}

describe('Reducer batch entity removal', () => {
  it('removes many entities in a single command correctly', () => {
    const entities: ImportedEntity[] = [];
    for (let i = 0; i < 100; i++) {
      entities.push(makeEntity(i + 1, `Entity${i}`, i % 20, Math.floor(i / 20)));
    }
    rebuildSpatialIndex(entities);
    let state: EditorState = syncGrids({
      ...createInitialState(),
      entities,
      nextEntityId: 101,
    });

    // Remove entities 1-50
    const removals = entities.slice(0, 50).map(e => ({ action: 'remove' as const, entity: e }));
    const command: Command = { label: 'Bulk delete', tileChanges: [], entityChanges: removals };

    state = editorReducer(state, { type: 'APPLY_COMMAND', command });

    expect(state.entities).toHaveLength(50);
    // Remaining should be entities 51-100
    for (let i = 51; i <= 100; i++) {
      expect(state.entities.find(e => e.uid === i)).toBeDefined();
    }
    // Removed should be gone
    for (let i = 1; i <= 50; i++) {
      expect(state.entities.find(e => e.uid === i)).toBeUndefined();
    }
    expect(spatialSize()).toBe(50);
  });

  it('handles interleaved remove+add (move pattern) correctly', () => {
    const e1 = makeEntity(1, 'Wall', 5, 5);
    const e2 = makeEntity(2, 'Door', 6, 5);
    rebuildSpatialIndex([e1, e2]);
    let state: EditorState = syncGrids({
      ...createInitialState(),
      entities: [e1, e2],
      nextEntityId: 3,
    });

    const moved1 = makeEntity(3, 'Wall', 10, 10);
    const moved2 = makeEntity(4, 'Door', 11, 10);
    const command: Command = {
      label: 'Move',
      tileChanges: [],
      entityChanges: [
        { action: 'remove', entity: e1 },
        { action: 'add', entity: moved1 },
        { action: 'remove', entity: e2 },
        { action: 'add', entity: moved2 },
      ],
    };

    state = editorReducer(state, { type: 'APPLY_COMMAND', command });

    expect(state.entities).toHaveLength(2);
    expect(state.entities.find(e => e.uid === 3)).toBeDefined();
    expect(state.entities.find(e => e.uid === 4)).toBeDefined();
    expect(state.entities.find(e => e.uid === 1)).toBeUndefined();
    expect(state.entities.find(e => e.uid === 2)).toBeUndefined();
    expect(spatialSize()).toBe(2);
    expect(spatialGetByUid(3)).toBeDefined();
    expect(spatialGetByUid(4)).toBeDefined();
  });

  it('undo of bulk removal restores all entities', () => {
    const entities = [makeEntity(1, 'A', 0, 0), makeEntity(2, 'B', 1, 0), makeEntity(3, 'C', 2, 0)];
    rebuildSpatialIndex(entities);
    let state: EditorState = syncGrids({
      ...createInitialState(),
      entities,
      nextEntityId: 4,
    });

    const command: Command = {
      label: 'Delete all',
      tileChanges: [],
      entityChanges: entities.map(e => ({ action: 'remove' as const, entity: e })),
    };

    state = editorReducer(state, { type: 'APPLY_COMMAND', command });
    expect(state.entities).toHaveLength(0);

    state = editorReducer(state, { type: 'UNDO' });
    expect(state.entities).toHaveLength(3);
    expect(state.entities.map(e => e.uid).sort()).toEqual([1, 2, 3]);
    expect(spatialSize()).toBe(3);
  });

  it('preserves entity order: adds appear after retained entities', () => {
    const e1 = makeEntity(1, 'A', 0, 0);
    const e2 = makeEntity(2, 'B', 1, 0);
    const e3 = makeEntity(3, 'C', 2, 0);
    rebuildSpatialIndex([e1, e2, e3]);
    let state: EditorState = syncGrids({
      ...createInitialState(),
      entities: [e1, e2, e3],
      nextEntityId: 4,
    });

    // Remove e2, add e4
    const e4 = makeEntity(4, 'D', 5, 5);
    const command: Command = {
      label: 'Replace',
      tileChanges: [],
      entityChanges: [
        { action: 'remove', entity: e2 },
        { action: 'add', entity: e4 },
      ],
    };

    state = editorReducer(state, { type: 'APPLY_COMMAND', command });

    // e1, e3 retained in original order, e4 appended
    expect(state.entities.map(e => e.uid)).toEqual([1, 3, 4]);
  });

  it('cascade delete of container contents still works', () => {
    const container = makeEntity(1, 'Locker', 5, 5);
    const child = makeEntity(2, 'Wrench', 0, 0);
    rebuildSpatialIndex([container]);
    let state: EditorState = syncGrids({
      ...createInitialState(),
      entities: [container],
      containedEntities: { 1: [child] },
      nextEntityId: 3,
    });

    const command: Command = {
      label: 'Delete container',
      tileChanges: [],
      entityChanges: [{ action: 'remove', entity: container }],
    };

    state = editorReducer(state, { type: 'APPLY_COMMAND', command });
    expect(state.entities).toHaveLength(0);
    // Contained entities should be cascade-removed too
    expect(state.containedEntities[1]).toBeUndefined();
  });
});

describe('REMOVE_SELECT_ENTITIES', () => {
  it('removes specified UIDs from selectedEntityUids', () => {
    let state = createInitialState();
    state = { ...state, selectedEntityUids: [1, 2, 3, 4, 5] };

    state = editorReducer(state, { type: 'REMOVE_SELECT_ENTITIES', uids: [2, 4] });
    expect(state.selectedEntityUids).toEqual([1, 3, 5]);
  });

  it('does nothing when removing UIDs not in selection', () => {
    let state = createInitialState();
    state = { ...state, selectedEntityUids: [1, 2, 3] };

    state = editorReducer(state, { type: 'REMOVE_SELECT_ENTITIES', uids: [99, 100] });
    expect(state.selectedEntityUids).toEqual([1, 2, 3]);
  });

  it('results in empty array when all UIDs removed', () => {
    let state = createInitialState();
    state = { ...state, selectedEntityUids: [1, 2] };

    state = editorReducer(state, { type: 'REMOVE_SELECT_ENTITIES', uids: [1, 2] });
    expect(state.selectedEntityUids).toEqual([]);
  });

  it('handles empty uids array', () => {
    let state = createInitialState();
    state = { ...state, selectedEntityUids: [1, 2, 3] };

    state = editorReducer(state, { type: 'REMOVE_SELECT_ENTITIES', uids: [] });
    expect(state.selectedEntityUids).toEqual([1, 2, 3]);
  });
});
