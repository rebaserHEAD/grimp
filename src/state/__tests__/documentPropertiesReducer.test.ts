import { describe, it, expect } from 'vitest';
import { editorReducer } from '../editorReducer';
import { createInitialState } from '../editorState';
import type { EditorState } from '../editorState';
import { importMap, ImportedMap } from '../../import/mapImporter';
import { exportMap } from '../../export/mapExporter';

/**
 * Map Properties edits: grid identity (MetaData name/desc) and ship switches
 * (bare root components like Shuttle/IFF).
 *
 * Imported documents must be patched surgically: only the edited component
 * block may change, every other byte of the export stays identical.
 * From-scratch documents flow through the export synthesis fallback.
 */

function chunkBase64F7(tileIndex: number): string {
  const buf = new Uint8Array(256 * 7);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < 256; i++) {
    view.setInt32(i * 7, tileIndex, true);
  }
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function gridFileYaml(metaDataName = 'oldname'): string {
  const nameLine = metaDataName === '' ? '' : `      name: ${metaDataName}\n`;
  return `meta:
  format: 7
  category: Grid
maps: []
grids:
- 42
orphans:
- 42
nullspace: []
tilemap:
  0: Space
  7: FloorSteel
entities:
- proto: ""
  entities:
  - uid: 42
    components:
    - type: MetaData
${nameLine}    - type: Transform
      parent: invalid
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${chunkBase64F7(7)}
          version: 7
`;
}

function loadIntoState(yaml: string): EditorState {
  const map = importMap(yaml);
  return editorReducer(createInitialState(), { type: 'LOAD_MAP', map });
}

/** Build the exportMap input the way App.tsx handleExport does. */
function stateToExportInput(state: EditorState): ImportedMap {
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

describe('LOAD_MAP grid display naming', () => {
  it('keeps the file MetaData name when present', () => {
    const map = importMap(gridFileYaml('Adjutant'));
    const state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map, sourceName: 'adjutant.yml' });
    expect(state.grids[0].name).toBe('Adjutant');
  });

  it('falls back to the filename for unnamed grids', () => {
    const map = importMap(gridFileYaml(''));
    const state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map, sourceName: 'warspite.yml' });
    expect(state.grids[0].name).toBe('warspite');
  });

  it('treats the engine default "grid" as unnamed', () => {
    const map = importMap(gridFileYaml('grid'));
    const state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map, sourceName: 'warspite.yml' });
    expect(state.grids[0].name).toBe('warspite');
  });

  it('falls back to the grid uid when no filename is known', () => {
    const map = importMap(gridFileYaml(''));
    const state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map });
    expect(state.grids[0].name).toBe('Grid 42');
  });

  it('display naming never rewrites the file MetaData', () => {
    const map = importMap(gridFileYaml(''));
    const state = editorReducer(createInitialState(), { type: 'LOAD_MAP', map, sourceName: 'warspite.yml' });
    const out = exportMap(stateToExportInput(state));
    expect(out).not.toContain('warspite');
  });
});

describe('SET_GRID_IDENTITY on an imported grid file', () => {
  it('renames surgically: only the MetaData block changes', () => {
    const state = loadIntoState(gridFileYaml());
    const before = exportMap(stateToExportInput(state));

    const renamed = editorReducer(state, {
      type: 'SET_GRID_IDENTITY', gridUid: 42, name: 'Warspite', desc: 'A fine ship.',
    });
    const after = exportMap(stateToExportInput(renamed));

    expect(after).toContain('      name: Warspite');
    expect(after).toContain('      desc: A fine ship.');
    expect(renamed.dirty).toBe(true);
    // Surgical: removing the identity lines from both exports yields identical text
    const strip = (s: string) => s.split('\n').filter(l => !/^ {6}(name|desc):/.test(l)).join('\n');
    expect(strip(after)).toBe(strip(before));
  });

  it('empty name removes the field', () => {
    const state = loadIntoState(gridFileYaml());
    const cleared = editorReducer(state, {
      type: 'SET_GRID_IDENTITY', gridUid: 42, name: '', desc: '',
    });
    const out = exportMap(stateToExportInput(cleared));
    expect(out).not.toContain('name: oldname');
    expect(out).not.toMatch(/^ {6}name:/m);
  });

  it('mirrors into structuralEntityData', () => {
    const state = loadIntoState(gridFileYaml());
    const renamed = editorReducer(state, {
      type: 'SET_GRID_IDENTITY', gridUid: 42, name: 'Warspite', desc: '',
    });
    const meta = renamed.structuralEntityData![42].find(c => c.type === 'MetaData') as any;
    expect(meta.name).toBe('Warspite');
    expect(meta.desc).toBeUndefined();
  });
});

describe('SET_ROOT_COMPONENT on an imported grid file', () => {
  it('toggling Shuttle on adds exactly one line; toggling off restores bytes', () => {
    const state = loadIntoState(gridFileYaml());
    const before = exportMap(stateToExportInput(state));

    const withShuttle = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT', gridUid: 42, componentType: 'Shuttle', enabled: true,
    });
    const after = exportMap(stateToExportInput(withShuttle));
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    expect(afterLines).toContain('    - type: Shuttle');
    expect(afterLines.length).toBe(beforeLines.length + 1);

    const removed = editorReducer(withShuttle, {
      type: 'SET_ROOT_COMPONENT', gridUid: 42, componentType: 'Shuttle', enabled: false,
    });
    expect(exportMap(stateToExportInput(removed))).toBe(before);
  });
});

describe('SET_ROOT_COMPONENT_FIELD (BecomesStation) on an imported grid file', () => {
  it('creates the component with its id field, surgically', () => {
    const state = loadIntoState(gridFileYaml());
    const before = exportMap(stateToExportInput(state));

    const withStation = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT_FIELD', gridUid: 42, componentType: 'BecomesStation', field: 'id', value: 'Warspite',
    });
    const after = exportMap(stateToExportInput(withStation));
    // Matches the game-saved shape (e.g. archer.yml): block + scalar id
    expect(after).toContain('    - type: BecomesStation');
    expect(after).toContain('      id: Warspite');
    expect(after.split('\n').length).toBe(before.split('\n').length + 2);

    // Removing the component restores the original bytes
    const removed = editorReducer(withStation, {
      type: 'SET_ROOT_COMPONENT', gridUid: 42, componentType: 'BecomesStation', enabled: false,
    });
    expect(exportMap(stateToExportInput(removed))).toBe(before);
  });

  it('updates an existing id in place and mirrors into structural data', () => {
    let state = loadIntoState(gridFileYaml());
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT_FIELD', gridUid: 42, componentType: 'BecomesStation', field: 'id', value: 'Warspite',
    });
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT_FIELD', gridUid: 42, componentType: 'BecomesStation', field: 'id', value: 'Renown',
    });
    const out = exportMap(stateToExportInput(state));
    expect(out).toContain('      id: Renown');
    expect(out).not.toContain('Warspite');
    const becomes = state.structuralEntityData![42].find(c => c.type === 'BecomesStation') as any;
    expect(becomes.id).toBe('Renown');
  });
});

describe('map-entity contamination cleanup', () => {
  it('removing the quartet strips only those blocks', () => {
    // Grid file whose root picked up map components (saved-as-map at some point)
    const contaminated = gridFileYaml().replace(
      '    - type: MapGrid',
      `    - type: Map
      mapPaused: True
    - type: PhysicsMap
    - type: GridTree
    - type: MovedGrids
    - type: MapGrid`,
    );
    let state = loadIntoState(contaminated);
    for (const t of ['Map', 'PhysicsMap', 'GridTree', 'MovedGrids']) {
      state = editorReducer(state, {
        type: 'SET_ROOT_COMPONENT', gridUid: 42, componentType: t, enabled: false,
      });
    }
    const out = exportMap(stateToExportInput(state));
    expect(out).not.toContain('type: Map\n');
    expect(out).not.toContain('PhysicsMap');
    expect(out).not.toContain('GridTree');
    expect(out).not.toContain('MovedGrids');
    expect(out).not.toContain('mapPaused');
    // The clean file is what a clean import would have produced
    expect(out).toBe(exportMap(importMap(gridFileYaml())));
  });
});

describe('Map Properties on a from-scratch grid document', () => {
  it('identity and ship switches reach the synthesized export', () => {
    let state = editorReducer(createInitialState(), { type: 'NEW_GRID' });
    state = editorReducer(state, {
      type: 'SET_GRID_IDENTITY', gridUid: 1, name: 'Warspite', desc: 'A fine ship.',
    });
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT', gridUid: 1, componentType: 'Shuttle', enabled: true,
    });
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT', gridUid: 1, componentType: 'IFF', enabled: true,
    });

    const out = exportMap(stateToExportInput(state));
    expect(out).toContain('      name: Warspite');
    expect(out).toContain('      desc: A fine ship.');
    expect(out).toContain('    - type: Shuttle');
    expect(out).toContain('    - type: IFF');
    // desc before name, engine field order is alphabetical
    expect(out.indexOf('desc: A fine ship.')).toBeLessThan(out.indexOf('name: Warspite'));
  });

  it('toggling a switch off removes it from the export', () => {
    let state = editorReducer(createInitialState(), { type: 'NEW_GRID' });
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT', gridUid: 1, componentType: 'Shuttle', enabled: true,
    });
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT', gridUid: 1, componentType: 'Shuttle', enabled: false,
    });
    expect(exportMap(stateToExportInput(state))).not.toContain('Shuttle');
  });

  it('BecomesStation with id reaches the synthesized export', () => {
    let state = editorReducer(createInitialState(), { type: 'NEW_GRID' });
    state = editorReducer(state, {
      type: 'SET_ROOT_COMPONENT_FIELD', gridUid: 1, componentType: 'BecomesStation', field: 'id', value: 'Warspite',
    });
    const out = exportMap(stateToExportInput(state));
    expect(out).toContain('    - type: BecomesStation');
    expect(out).toContain('      id: Warspite');
  });
});
