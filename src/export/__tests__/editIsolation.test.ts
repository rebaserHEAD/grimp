/**
 * Edit Isolation Tests
 *
 * Verify that editing one grid doesn't affect other grids on export.
 * This is the critical multi-grid safety guarantee.
 */
import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { importMap } from '../../import/mapImporter';
import { exportMap } from '../mapExporter';
import type { ImportedMap } from '../../import/mapImporter';
import { editorReducer } from '../../state/editorReducer';
import { createInitialState } from '../../state/editorState';
import type { Command } from '../../types';
import { pickMap } from '../../test-utils/realMaps';

// Maps are discovered from the host repo's Resources/Maps (see test-utils/realMaps).
// We use the first real map that imports to more than one grid; tests skip when none
// is available. No fork or specific map name is assumed.
const MAPS_DIR = resolve(__dirname, '../../../../../Resources/Maps');
const multiGrid = pickMap(MAPS_DIR, importMap, { minGrids: 2 });

/** Build an ImportedMap from EditorState for export. Mirrors App.tsx handleExport. */
function stateToImportedMap(state: ReturnType<typeof createInitialState>): ImportedMap {
  return {
    meta: state.meta,
    tilemap: state.tilemap ?? {},
    grid: state.grid,
    entities: state.entities,
    containedEntities: state.containedEntities,
    gridUid: state.gridUid,
    mapUid: state.mapUid,
    maps: state.maps,
    grids: state.gridUidList,
    gridDataList: state.grids,
    structuralEntityData: state.structuralEntityData,
    entityRawComponents: state.entityRawComponents,
    entityRawPreamble: state.entityRawPreamble,
    chunkKeyOrder: state.chunkKeyOrder,
    lineEnding: state.lineEnding,
    hasDocumentTerminator: state.hasDocumentTerminator,
    entityOrder: state.entityOrder,
  };
}

describe('edit isolation', () => {
  it('editing grid 0 does not change grid 1 on export', () => {
    if (!multiGrid) return; // skip when no multi-grid map available
    const original = multiGrid.yaml;
    const map = importMap(original);
    expect(map.gridDataList!.length).toBeGreaterThan(1);

    // Load into editor state
    let state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map });

    // Snapshot grid 1's tiles and entities before edit
    const grid1TilesBefore = state.grids[1].grid.cells.map(c => c.tileId);
    const grid1EntityCountBefore = state.grids[1].entities.length;

    // Edit a tile on grid 0 (active grid)
    const g0 = state.grids[0].grid;
    const firstNonSpaceIdx = g0.cells.findIndex(c => c.tileId !== 'Space');
    const cell = g0.cells[firstNonSpaceIdx >= 0 ? firstNonSpaceIdx : 0];
    const tileX = g0.offsetX + (firstNonSpaceIdx >= 0 ? firstNonSpaceIdx % g0.width : 0);
    const tileY = g0.offsetY + (firstNonSpaceIdx >= 0 ? Math.floor(firstNonSpaceIdx / g0.width) : 0);

    const command: Command = {
      label: 'test paint',
      tileChanges: [{
        x: tileX,
        y: tileY,
        before: { ...cell },
        after: { tileId: cell.tileId === 'Plating' ? 'FloorSteel' : 'Plating' },
      }],
      entityChanges: [],
    };
    state = editorReducer(state, { type: 'APPLY_COMMAND', command });

    // Verify grid 1 is untouched in state
    const grid1TilesAfter = state.grids[1].grid.cells.map(c => c.tileId);
    expect(grid1TilesAfter).toEqual(grid1TilesBefore);
    expect(state.grids[1].entities.length).toBe(grid1EntityCountBefore);

    // Export through the full pipeline and reimport
    const exported = exportMap(stateToImportedMap(state));
    const reimported = importMap(exported);

    // Grid 1 tiles should match original exactly
    expect(reimported.gridDataList![1].grid.cells.length).toBe(
      map.gridDataList![1].grid.cells.length
    );
    for (let i = 0; i < reimported.gridDataList![1].grid.cells.length; i++) {
      expect(reimported.gridDataList![1].grid.cells[i].tileId).toBe(
        map.gridDataList![1].grid.cells[i].tileId
      );
    }

    // Grid 1 entity count should match
    expect(reimported.gridDataList![1].entities.length).toBe(grid1EntityCountBefore);
  });

  it('editing grid 1 does not change grid 0 on export', () => {
    if (!multiGrid) return; // skip when no multi-grid map available
    const original = multiGrid.yaml;
    const map = importMap(original);

    let state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map });

    // Snapshot grid 0
    const grid0TilesBefore = state.grids[0].grid.cells.map(c => c.tileId);
    const grid0EntityCountBefore = state.grids[0].entities.length;

    // Switch to grid 1 and edit it
    state = editorReducer(state, { type: 'SET_ACTIVE_GRID', index: 1 });
    const g1 = state.grids[1].grid;
    const firstNonSpaceIdx = g1.cells.findIndex(c => c.tileId !== 'Space');
    if (firstNonSpaceIdx < 0) return; // skip if grid 1 has no tiles

    const cell = g1.cells[firstNonSpaceIdx];
    const tileX = g1.offsetX + (firstNonSpaceIdx % g1.width);
    const tileY = g1.offsetY + Math.floor(firstNonSpaceIdx / g1.width);

    const command: Command = {
      label: 'test paint grid 1',
      tileChanges: [{
        x: tileX,
        y: tileY,
        before: { ...cell },
        after: { tileId: cell.tileId === 'Plating' ? 'FloorSteel' : 'Plating' },
      }],
      entityChanges: [],
    };
    state = editorReducer(state, { type: 'APPLY_COMMAND', command });

    // Verify grid 0 untouched in state
    const grid0TilesAfter = state.grids[0].grid.cells.map(c => c.tileId);
    expect(grid0TilesAfter).toEqual(grid0TilesBefore);
    expect(state.grids[0].entities.length).toBe(grid0EntityCountBefore);

    // Export and reimport
    const exported = exportMap(stateToImportedMap(state));
    const reimported = importMap(exported);

    // Grid 0 tiles should match original
    for (let i = 0; i < reimported.gridDataList![0].grid.cells.length; i++) {
      expect(reimported.gridDataList![0].grid.cells[i].tileId).toBe(
        map.gridDataList![0].grid.cells[i].tileId
      );
    }
    expect(reimported.gridDataList![0].entities.length).toBe(grid0EntityCountBefore);
  });

  it('adding entity to grid 0 does not affect grid 1 entity count', () => {
    if (!multiGrid) return; // skip when no multi-grid map available
    const original = multiGrid.yaml;
    const map = importMap(original);

    let state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map });
    const grid1EntityCountBefore = state.grids[1].entities.length;

    // Add an entity to grid 0
    const newEntity = {
      uid: state.nextEntityId,
      prototype: 'WallSolid',
      position: { x: 0.5, y: 0.5 },
      rotation: 0,
      components: [{ type: 'Transform', pos: '0.5,0.5', parent: state.grids[0].gridUid }],
    };

    const command: Command = {
      label: 'add entity',
      tileChanges: [],
      entityChanges: [{ action: 'add', entity: newEntity }],
    };
    state = editorReducer(state, { type: 'APPLY_COMMAND', command });

    // Grid 1 entity count unchanged
    expect(state.grids[1].entities.length).toBe(grid1EntityCountBefore);

    // Export and verify
    const exported = exportMap(stateToImportedMap(state));
    const reimported = importMap(exported);
    expect(reimported.gridDataList![1].entities.length).toBe(grid1EntityCountBefore);
  });
});
