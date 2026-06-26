import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';
import type { EditorState } from '../editorState';
import type { Command } from '../../types';
import type { ImportedEntity, ImportedMap } from '../../import/mapImporter';
import type { GridData } from '../gridData';
import { createEmptyGridData } from '../gridData';

function makeEntity(uid: number, proto: string, gridUid: number): ImportedEntity {
  return {
    uid,
    prototype: proto,
    position: { x: 5.5, y: 3.5 },
    rotation: 0,
    components: [
      { type: 'Transform', pos: '5.5,3.5', parent: gridUid },
    ],
  };
}

function makeTwoGridState(): EditorState {
  const grid1: GridData = {
    ...createEmptyGridData(2, 'Main Station'),
    entities: [makeEntity(3, 'WallSolid', 2)],
    grid: {
      width: 16, height: 16, offsetX: 0, offsetY: 0,
      cells: Array.from({ length: 256 }, () => ({ tileId: 'FloorSteel' })),
    },
  };
  const grid2: GridData = {
    ...createEmptyGridData(100, 'Shuttle'),
    entities: [makeEntity(4, 'APCBasic', 100)],
    worldPosition: { x: 50.5, y: 20.5 },
    grid: {
      width: 16, height: 16, offsetX: 0, offsetY: 0,
      cells: Array.from({ length: 256 }, () => ({ tileId: 'FloorWood' })),
    },
  };

  const base = createInitialState();
  return {
    ...base,
    grids: [grid1, grid2],
    activeGridIndex: 0,
    grid: grid1.grid,
    entities: grid1.entities,
    containedEntities: grid1.containedEntities,
    gridUid: grid1.gridUid,
    nextEntityId: 101,
    mapUid: 1,
  };
}

describe('multi-grid reducer', () => {
  describe('LOAD_MAP', () => {
    it('populates grids array from gridDataList', () => {
      const grid1: GridData = {
        ...createEmptyGridData(2, 'Main Station'),
        entities: [makeEntity(3, 'WallSolid', 2)],
      };
      const grid2: GridData = {
        ...createEmptyGridData(100, 'Shuttle'),
        entities: [makeEntity(4, 'APCBasic', 100)],
      };

      const map: ImportedMap = {
        meta: { format: 7 },
        tilemap: { 0: 'Space', 7: 'FloorSteel' },
        grid: grid1.grid,
        entities: grid1.entities,
        gridUid: 2,
        mapUid: 1,
        grids: [2, 100],
        gridDataList: [grid1, grid2],
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });

      expect(result.grids).toHaveLength(2);
      expect(result.grids[0].gridUid).toBe(2);
      expect(result.grids[0].name).toBe('Main Station');
      expect(result.grids[1].gridUid).toBe(100);
      expect(result.grids[1].name).toBe('Shuttle');
      expect(result.activeGridIndex).toBe(0);
    });

    it('computes nextEntityId across all grids', () => {
      const grid1: GridData = {
        ...createEmptyGridData(2, 'G1'),
        entities: [makeEntity(3, 'WallSolid', 2)],
      };
      const grid2: GridData = {
        ...createEmptyGridData(100, 'G2'),
        entities: [makeEntity(500, 'APCBasic', 100)],
      };

      const map: ImportedMap = {
        meta: { format: 7 },
        tilemap: {},
        grid: grid1.grid,
        entities: grid1.entities,
        gridUid: 2,
        mapUid: 1,
        gridDataList: [grid1, grid2],
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });
      expect(result.nextEntityId).toBe(501);
    });

    it('includes contained entity UIDs in nextEntityId calculation', () => {
      const grid1: GridData = {
        ...createEmptyGridData(2, 'G1'),
        entities: [makeEntity(3, 'LockerBotanist', 2)],
        containedEntities: {
          3: [{
            uid: 9999,
            prototype: 'Crowbar',
            position: { x: 0, y: 0 },
            rotation: 0,
            components: [{ type: 'Transform', parent: 3 }],
          }],
        },
      };

      const map: ImportedMap = {
        meta: { format: 7 },
        tilemap: {},
        grid: grid1.grid,
        entities: grid1.entities,
        gridUid: 2,
        mapUid: 1,
        gridDataList: [grid1],
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });
      expect(result.nextEntityId).toBe(10000);
    });

    it('falls back to single-grid when gridDataList is absent', () => {
      const map: ImportedMap = {
        meta: { format: 6 },
        tilemap: { 0: 'Space' },
        grid: { width: 16, height: 16, offsetX: 0, offsetY: 0, cells: [] },
        entities: [makeEntity(3, 'WallSolid', 2)],
        gridUid: 2,
        mapUid: 1,
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });
      expect(result.grids).toHaveLength(1);
      expect(result.grids[0].gridUid).toBe(2);
      expect(result.grids[0].entities).toHaveLength(1);
    });

    it('stores gridUidList from map.grids', () => {
      const map: ImportedMap = {
        meta: { format: 7 },
        tilemap: {},
        grid: { width: 0, height: 0, offsetX: 0, offsetY: 0, cells: [] },
        entities: [],
        gridUid: 2,
        mapUid: 1,
        grids: [2, 100],
        gridDataList: [createEmptyGridData(2, 'G1'), createEmptyGridData(100, 'G2')],
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });
      expect(result.gridUidList).toEqual([2, 100]);
    });

    it('preserves entityRawPreamble, hasDocumentTerminator, and entityOrder', () => {
      const map: ImportedMap = {
        meta: { format: 7 },
        tilemap: {},
        grid: { width: 0, height: 0, offsetX: 0, offsetY: 0, cells: [] },
        entities: [],
        gridUid: 2,
        mapUid: 1,
        gridDataList: [createEmptyGridData(2, 'G1')],
        entityRawPreamble: { 1: ['  mapInit: True'] },
        hasDocumentTerminator: true,
        entityOrder: [3, 4, 5],
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });
      expect(result.entityRawPreamble).toEqual({ 1: ['  mapInit: True'] });
      expect(result.hasDocumentTerminator).toBe(true);
      expect(result.entityOrder).toEqual([3, 4, 5]);
    });

    it('syncs legacy fields from first grid', () => {
      const grid1: GridData = {
        ...createEmptyGridData(2, 'Main'),
        entities: [makeEntity(3, 'WallSolid', 2)],
      };

      const map: ImportedMap = {
        meta: { format: 7 },
        tilemap: {},
        grid: grid1.grid,
        entities: grid1.entities,
        gridUid: 2,
        mapUid: 1,
        gridDataList: [grid1],
      };

      const state = createInitialState();
      const result = editorReducer(state, { type: 'LOAD_MAP', map });
      expect(result.grid).toBe(result.grids[0].grid);
      expect(result.entities).toBe(result.grids[0].entities);
      expect(result.containedEntities).toBe(result.grids[0].containedEntities);
      expect(result.gridUid).toBe(2);
    });
  });

  describe('SET_ACTIVE_GRID', () => {
    it('switches active grid index', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      expect(result.activeGridIndex).toBe(1);
    });

    it('syncs legacy fields to new active grid', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      expect(result.grid).toBe(result.grids[1].grid);
      expect(result.entities).toBe(result.grids[1].entities);
      expect(result.gridUid).toBe(100);
    });

    it('clears entity selection on grid switch', () => {
      const state = { ...makeTwoGridState(), selectedEntityUids: [3] };
      const result = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      expect(result.selectedEntityUids).toEqual([]);
    });

    it('clamps index to valid range', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 99 });
      expect(result.activeGridIndex).toBe(1); // clamped to max
    });

    it('returns same state if index unchanged', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 0 });
      expect(result).toBe(state);
    });
  });

  describe('APPLY_COMMAND targets active grid', () => {
    it('applies tile changes to active grid only', () => {
      const state = makeTwoGridState();
      const command: Command = {
        label: 'Paint tile',
        tileChanges: [{
          x: 0, y: 0,
          before: { tileId: 'FloorSteel' },
          after: { tileId: 'Plating' },
        }],
        entityChanges: [],
      };

      const result = editorReducer(state, { type: 'APPLY_COMMAND', command });

      // Grid 0 (active) should be changed
      const cell0 = result.grids[0].grid.cells[0];
      expect(cell0.tileId).toBe('Plating');

      // Grid 1 should be untouched
      expect(result.grids[1].grid.cells[0].tileId).toBe('FloorWood');
    });

    it('applies entity adds to active grid only', () => {
      const state = makeTwoGridState();
      const newEntity = makeEntity(200, 'Chair', 2);
      const command: Command = {
        label: 'Add chair',
        tileChanges: [],
        entityChanges: [{ action: 'add', entity: newEntity }],
      };

      const result = editorReducer(state, { type: 'APPLY_COMMAND', command });
      expect(result.grids[0].entities).toHaveLength(2);
      expect(result.grids[1].entities).toHaveLength(1); // untouched
    });

    it('stores gridUid on command for undo targeting', () => {
      const state = makeTwoGridState();
      const command: Command = {
        label: 'Paint',
        tileChanges: [{
          x: 0, y: 0,
          before: { tileId: 'FloorSteel' },
          after: { tileId: 'Plating' },
        }],
        entityChanges: [],
      };

      const result = editorReducer(state, { type: 'APPLY_COMMAND', command });
      expect((result.undoStack[0] as Command).gridUid).toBe(2); // active grid's UID
    });

    it('applies command to specific grid when gridUid is provided', () => {
      const state = makeTwoGridState(); // active = grid 0 (uid=2)
      const command: Command = {
        label: 'Paint shuttle',
        tileChanges: [{
          x: 0, y: 0,
          before: { tileId: 'FloorWood' },
          after: { tileId: 'Plating' },
        }],
        entityChanges: [],
        gridUid: 100, // target grid 1
      };

      const result = editorReducer(state, { type: 'APPLY_COMMAND', command });
      expect(result.grids[1].grid.cells[0].tileId).toBe('Plating');
      expect(result.grids[0].grid.cells[0].tileId).toBe('FloorSteel'); // untouched
    });
  });

  describe('UNDO targets correct grid', () => {
    it('undoes on the correct grid regardless of active grid', () => {
      let state = makeTwoGridState(); // active = grid 0 (uid=2)

      // Paint on grid 0
      const command: Command = {
        label: 'Paint',
        tileChanges: [{
          x: 0, y: 0,
          before: { tileId: 'FloorSteel' },
          after: { tileId: 'Plating' },
        }],
        entityChanges: [],
      };
      state = editorReducer(state, { type: 'APPLY_COMMAND', command });
      expect(state.grids[0].grid.cells[0].tileId).toBe('Plating');

      // Switch to grid 1
      state = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      expect(state.activeGridIndex).toBe(1);

      // Undo, should affect grid 0 even though grid 1 is active
      state = editorReducer(state, { type: 'UNDO' });
      expect(state.grids[0].grid.cells[0].tileId).toBe('FloorSteel');
      expect(state.grids[1].grid.cells[0].tileId).toBe('FloorWood'); // untouched
    });

    it('undo entity add removes from correct grid', () => {
      let state = makeTwoGridState();
      const newEntity = makeEntity(200, 'Chair', 2);
      state = editorReducer(state, {
        type: 'APPLY_COMMAND',
        command: {
          label: 'Add chair',
          tileChanges: [],
          entityChanges: [{ action: 'add', entity: newEntity }],
        },
      });
      expect(state.grids[0].entities).toHaveLength(2);

      // Switch grid then undo
      state = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      state = editorReducer(state, { type: 'UNDO' });
      expect(state.grids[0].entities).toHaveLength(1);
      expect(state.grids[1].entities).toHaveLength(1); // untouched
    });
  });

  describe('REDO', () => {
    it('redo reapplies to correct grid', () => {
      let state = makeTwoGridState();
      const command: Command = {
        label: 'Paint',
        tileChanges: [{
          x: 0, y: 0,
          before: { tileId: 'FloorSteel' },
          after: { tileId: 'Plating' },
        }],
        entityChanges: [],
      };

      state = editorReducer(state, { type: 'APPLY_COMMAND', command });
      state = editorReducer(state, { type: 'UNDO' });
      expect(state.grids[0].grid.cells[0].tileId).toBe('FloorSteel');

      // Switch grid then redo
      state = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      state = editorReducer(state, { type: 'REDO' });
      expect(state.grids[0].grid.cells[0].tileId).toBe('Plating');
    });
  });

  describe('NEW_MAP', () => {
    it('creates single empty grid', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'NEW_MAP' });
      expect(result.grids).toHaveLength(1);
      expect(result.grids[0].gridUid).toBe(1);
      expect(result.grids[0].name).toBe('Grid 1');
      expect(result.grids[0].entities).toEqual([]);
      expect(result.activeGridIndex).toBe(0);
    });

    it('clears undo/redo stacks', () => {
      let state = makeTwoGridState();
      state = editorReducer(state, {
        type: 'APPLY_COMMAND',
        command: { label: 'x', tileChanges: [], entityChanges: [{ action: 'add', entity: makeEntity(200, 'Chair', 2) }] },
      });
      const result = editorReducer(state, { type: 'NEW_MAP' });
      expect(result.undoStack).toEqual([]);
      expect(result.redoStack).toEqual([]);
    });

    it('syncs legacy fields', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'NEW_MAP' });
      expect(result.grid).toBe(result.grids[0].grid);
      expect(result.entities).toBe(result.grids[0].entities);
      expect(result.gridUid).toBe(1);
    });
  });

  describe('ADD_GRID', () => {
    it('adds a new grid', () => {
      const state = createInitialState();
      const result = editorReducer(state, { type: 'ADD_GRID', name: 'Shuttle' });
      expect(result.grids).toHaveLength(2);
      expect(result.grids[1].name).toBe('Shuttle');
      expect(result.grids[1].gridUid).toBe(2); // next after uid=1
    });

    it('uses world position when provided', () => {
      const state = createInitialState();
      const result = editorReducer(state, {
        type: 'ADD_GRID',
        name: 'Shuttle',
        worldPosition: { x: 50, y: 20 },
      });
      expect(result.grids[1].worldPosition).toEqual({ x: 50, y: 20 });
    });
  });

  describe('REMOVE_GRID', () => {
    it('removes a grid by UID', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'REMOVE_GRID', gridUid: 100 });
      expect(result.grids).toHaveLength(1);
      expect(result.grids[0].gridUid).toBe(2);
    });

    it('cannot remove last grid', () => {
      const state = createInitialState();
      const result = editorReducer(state, { type: 'REMOVE_GRID', gridUid: 1 });
      expect(result.grids).toHaveLength(1);
      expect(result).toBe(state);
    });

    it('adjusts activeGridIndex when removing active grid', () => {
      let state = makeTwoGridState();
      state = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
      const result = editorReducer(state, { type: 'REMOVE_GRID', gridUid: 100 });
      expect(result.activeGridIndex).toBe(0);
      expect(result.gridUid).toBe(2); // legacy synced
    });

    it('adjusts activeGridIndex when removing grid before active', () => {
      const state = { ...makeTwoGridState(), activeGridIndex: 1 };
      const result = editorReducer(state, { type: 'REMOVE_GRID', gridUid: 2 });
      expect(result.activeGridIndex).toBe(0);
      expect(result.grids[0].gridUid).toBe(100);
    });
  });

  describe('RENAME_GRID', () => {
    it('renames a grid', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'RENAME_GRID', gridUid: 100, name: 'Cargo Shuttle' });
      expect(result.grids[1].name).toBe('Cargo Shuttle');
    });

    it('no-op for unknown grid UID', () => {
      const state = makeTwoGridState();
      const result = editorReducer(state, { type: 'RENAME_GRID', gridUid: 999, name: 'Whatever' });
      expect(result).toBe(state);
    });
  });

  describe('legacy field sync', () => {
    it('APPLY_COMMAND syncs legacy fields after mutation', () => {
      const state = makeTwoGridState();
      const newEntity = makeEntity(200, 'Chair', 2);
      const result = editorReducer(state, {
        type: 'APPLY_COMMAND',
        command: { label: 'Add', tileChanges: [], entityChanges: [{ action: 'add', entity: newEntity }] },
      });
      // Legacy fields should reflect active grid
      expect(result.entities).toBe(result.grids[0].entities);
      expect(result.entities).toHaveLength(2);
    });
  });
});
