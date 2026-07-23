import type { TileGrid } from '../types';
import type { ImportedEntity } from '../import/mapImporter';
import type { GridDecalData } from '../import/decalParser';

export interface GridData {
  gridUid: number;
  name: string;
  grid: TileGrid;
  entities: ImportedEntity[];
  containedEntities: Record<number, ImportedEntity[]>;
  worldPosition: { x: number; y: number };
  structuralComponents: Record<string, unknown>[];
  chunkKeyOrder: string[];
  decals: GridDecalData;
  /** MetaData name/desc for from-scratch documents (set via Map Properties).
   * Imported documents carry identity in their raw component lines instead;
   * the exporter only reads this when there is no raw data to preserve. */
  identity?: { name?: string; desc?: string };
  /** Ship-switch components (e.g. Shuttle, IFF, BecomesStation) for
   * from-scratch documents, emitted onto the grid root by the export
   * synthesis fallback. Fields are scalar YAML values. */
  extraRootComponents?: { type: string; fields?: Record<string, string> }[];
}

export function createEmptyGridData(uid: number, name: string): GridData {
  return {
    gridUid: uid,
    name,
    grid: { width: 0, height: 0, offsetX: 0, offsetY: 0, cells: [] },
    entities: [],
    containedEntities: {},
    worldPosition: { x: 0, y: 0 },
    structuralComponents: [],
    chunkKeyOrder: [],
    decals: { decals: [], nextDecalId: 0 },
  };
}

export function getActiveGrid(grids: GridData[], activeGridIndex: number): GridData {
  const idx = Math.min(activeGridIndex, grids.length - 1);
  return grids[Math.max(0, idx)];
}

export function getGridByUid(grids: GridData[], uid: number): GridData | undefined {
  return grids.find(g => g.gridUid === uid);
}
