import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';
import type { EditorState } from '../editorState';
import type { ImportedEntity } from '../../import/mapImporter';
import type { GridData } from '../gridData';

/** Create test state with entities/grid/containedEntities properly synced to grids[0] */
function syncGrids(state: EditorState): EditorState {
  const activeGrid = state.grids[state.activeGridIndex];
  const updated: GridData = {
    ...activeGrid,
    grid: state.grid,
    entities: state.entities,
    containedEntities: state.containedEntities,
  };
  return {
    ...state,
    grids: state.grids.map((g, i) => i === state.activeGridIndex ? updated : g),
  };
}

function makeEntity(uid: number, proto: string): ImportedEntity {
  return {
    uid,
    prototype: proto,
    position: { x: 5.5, y: 3.5 },
    rotation: 0,
    components: [
      { type: 'Transform', pos: '5.5,3.5', parent: 1 },
      { type: 'ContainerContainer', containers: { entity_storage: { ents: [] } } },
    ],
  };
}

function makeStateWithContainer(): EditorState {
  const state = createInitialState();
  const locker = makeEntity(100, 'LockerBotanist');
  return syncGrids({
    ...state,
    entities: [locker],
    containedEntities: {},
    nextEntityId: 101,
    gridUid: 1,
  });
}

describe('container reducer actions', () => {
  it('ADD_CONTAINED_ENTITY adds entity to containedEntities', () => {
    const state = makeStateWithContainer();
    const result = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    expect(result.containedEntities[100]).toHaveLength(1);
    expect(result.containedEntities[100][0].prototype).toBe('Crowbar');
    expect(result.containedEntities[100][0].uid).toBe(101);
    expect(result.nextEntityId).toBe(102);
  });

  it('ADD_CONTAINED_ENTITY updates parent ContainerContainer ents', () => {
    const state = makeStateWithContainer();
    const result = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const locker = result.entities.find(e => e.uid === 100)!;
    const cc = locker.components.find((c: any) => c.type === 'ContainerContainer') as any;
    expect(cc.containers.entity_storage.ents).toContain(101);
  });

  it('ADD_CONTAINED_ENTITY is undoable', () => {
    const state = makeStateWithContainer();
    const added = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    expect(added.containedEntities[100]).toHaveLength(1);
    expect(added.undoStack).toHaveLength(1);

    const undone = editorReducer(added, { type: 'UNDO' });
    expect(undone.containedEntities[100] ?? []).toHaveLength(0);
    const locker = undone.entities.find(e => e.uid === 100)!;
    const cc = locker.components.find((c: any) => c.type === 'ContainerContainer') as any;
    expect(cc.containers.entity_storage.ents).not.toContain(101);
  });

  it('REMOVE_CONTAINED_ENTITY removes entity from containedEntities', () => {
    let state = makeStateWithContainer();
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const childUid = state.containedEntities[100][0].uid;
    const result = editorReducer(state, {
      type: 'REMOVE_CONTAINED_ENTITY',
      parentUid: 100,
      entityUid: childUid,
    });
    expect(result.containedEntities[100]).toBeUndefined();
  });

  it('REMOVE_CONTAINED_ENTITY updates parent ContainerContainer ents', () => {
    let state = makeStateWithContainer();
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const childUid = state.containedEntities[100][0].uid;
    const result = editorReducer(state, {
      type: 'REMOVE_CONTAINED_ENTITY',
      parentUid: 100,
      entityUid: childUid,
    });
    const locker = result.entities.find(e => e.uid === 100)!;
    const cc = locker.components.find((c: any) => c.type === 'ContainerContainer') as any;
    expect(cc.containers.entity_storage.ents).not.toContain(childUid);
  });

  it('REMOVE_CONTAINED_ENTITY is undoable', () => {
    let state = makeStateWithContainer();
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const childUid = state.containedEntities[100][0].uid;
    const removed = editorReducer(state, {
      type: 'REMOVE_CONTAINED_ENTITY',
      parentUid: 100,
      entityUid: childUid,
    });
    expect(removed.containedEntities[100]).toBeUndefined();
    const undone = editorReducer(removed, { type: 'UNDO' });
    expect(undone.containedEntities[100]).toHaveLength(1);
    expect(undone.containedEntities[100][0].uid).toBe(childUid);
  });

  it('deleting container entity cascades to contained entities', () => {
    let state = makeStateWithContainer();
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Multitool',
    });
    expect(state.containedEntities[100]).toHaveLength(2);

    const deleted = editorReducer(state, {
      type: 'APPLY_COMMAND',
      command: {
        label: 'Delete LockerBotanist',
        tileChanges: [],
        entityChanges: [{ action: 'remove', entity: state.entities.find(e => e.uid === 100)! }],
      },
    });
    expect(deleted.entities.find(e => e.uid === 100)).toBeUndefined();
    expect(deleted.containedEntities[100]).toBeUndefined();
  });

  it('undoing container deletion restores contained entities', () => {
    let state = makeStateWithContainer();
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });

    const deleted = editorReducer(state, {
      type: 'APPLY_COMMAND',
      command: {
        label: 'Delete LockerBotanist',
        tileChanges: [],
        entityChanges: [{ action: 'remove', entity: state.entities.find(e => e.uid === 100)! }],
      },
    });
    expect(deleted.containedEntities[100]).toBeUndefined();

    const undone = editorReducer(deleted, { type: 'UNDO' });
    expect(undone.entities.find(e => e.uid === 100)).toBeDefined();
    expect(undone.containedEntities[100]).toHaveLength(1);
  });

  it('LOAD_MAP populates containedEntities from imported map', () => {
    const state = createInitialState();
    const result = editorReducer(state, {
      type: 'LOAD_MAP',
      map: {
        meta: { format: 6 },
        tilemap: { 0: 'Space' },
        grid: { width: 0, height: 0, offsetX: 0, offsetY: 0, cells: [] },
        entities: [makeEntity(100, 'LockerBotanist')],
        containedEntities: {
          100: [{
            uid: 101, prototype: 'Crowbar', position: { x: 0, y: 0 }, rotation: 0,
            components: [{ type: 'Transform', parent: 100 }, { type: 'Physics', canCollide: false }],
          }],
        },
        gridUid: 1,
        mapUid: 0,
      },
    });
    expect(result.containedEntities[100]).toHaveLength(1);
    expect(result.containedEntities[100][0].prototype).toBe('Crowbar');
    expect(result.nextEntityId).toBe(102);
  });

  it('NEW_MAP clears containedEntities', () => {
    let state = makeStateWithContainer();
    state = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const result = editorReducer(state, { type: 'NEW_MAP' });
    expect(result.containedEntities).toEqual({});
  });

  it('ADD_CONTAINED_ENTITY creates ContainerContainer if missing', () => {
    const state = createInitialState();
    const entity: ImportedEntity = {
      uid: 100, prototype: 'LockerBotanist',
      position: { x: 5, y: 3 }, rotation: 0,
      components: [{ type: 'Transform', pos: '5.5,3.5', parent: 1 }],
    };
    const withEntity: EditorState = syncGrids({
      ...state,
      entities: [entity],
      containedEntities: {},
      nextEntityId: 101,
    });
    const result = editorReducer(withEntity, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const locker = result.entities.find(e => e.uid === 100)!;
    const cc = locker.components.find((c: any) => c.type === 'ContainerContainer') as any;
    expect(cc).toBeDefined();
    expect(cc.containers.entity_storage.ents).toContain(101);
  });

  it('redo after undo of ADD_CONTAINED_ENTITY restores state', () => {
    const state = makeStateWithContainer();
    const added = editorReducer(state, {
      type: 'ADD_CONTAINED_ENTITY',
      parentUid: 100,
      prototypeId: 'Crowbar',
    });
    const undone = editorReducer(added, { type: 'UNDO' });
    expect(undone.containedEntities[100] ?? []).toHaveLength(0);

    const redone = editorReducer(undone, { type: 'REDO' });
    expect(redone.containedEntities[100]).toHaveLength(1);
    expect(redone.containedEntities[100][0].prototype).toBe('Crowbar');
    const locker = redone.entities.find(e => e.uid === 100)!;
    const cc = locker.components.find((c: any) => c.type === 'ContainerContainer') as any;
    expect(cc.containers.entity_storage.ents).toContain(101);
  });
});
