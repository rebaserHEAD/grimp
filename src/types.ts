// ---- Geometry ----

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---- Tile Grid ----

export interface TileCell {
  tileId: string;
  flags?: number;            // byte, preserved from import
  variant?: number;          // byte, preserved from import
  rotationMirroring?: number; // byte, format 7+ only
}

export interface TileGrid {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  cells: TileCell[];
  firelockPositions?: { gx: number; gy: number }[];
}

// ---- Directions ----

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

// ---- Infrastructure (kept for legacy rendering compatibility) ----

export interface CableSegment {
  type: string;
  tiles: Point[];
}

export interface PipeSegment {
  tiles: Point[];
  color?: string;
}

export interface ProcessedPipe {
  x: number;
  y: number;
  prototype: string;
  rotation: number;
  color?: string;
}

export interface InfrastructureLayout {
  entities: import('./import/mapImporter').ImportedEntity[];
  cableSegments: CableSegment[];
  pipeSegments: PipeSegment[];
  processedPipes: ProcessedPipe[];
  disposalSegments: PipeSegment[];
  processedDisposal: ProcessedPipe[];
}

// ---- Editor-specific types ----

export type ToolType = 'paint' | 'erase' | 'eyedropper' | 'fill' | 'rectangle' | 'line' | 'circle' | 'select' | 'polygon' | 'pan' | 'entitySelect' | 'entityPlace' | 'cableDraw' | 'pipeDraw' | 'deviceLink' | 'prefabPlace';

// ---- Infrastructure drawing ----

export type CableType = 'CableHV' | 'CableMV' | 'CableApcExtension';
export type PipeType = 'supply' | 'return' | 'disposal';

export interface InfrastructureSelection {
  mode: 'cable' | 'pipe';
  cableType: CableType;
  pipeType: PipeType;
}

export const PIPE_COLORS: Record<'supply' | 'return', string> = {
  supply: '#0055CCFF',
  return: '#990000FF',
};

export const CABLE_DISPLAY: Record<CableType, { label: string; color: string }> = {
  CableHV: { label: 'HV Cable', color: '#ff8800' },
  CableMV: { label: 'MV Cable', color: '#ffcc00' },
  CableApcExtension: { label: 'APC Cable', color: '#00cc44' },
};

export const PIPE_DISPLAY: Record<PipeType, { label: string; color: string }> = {
  supply: { label: 'Supply Pipe', color: '#0088ff' },
  return: { label: 'Return Pipe', color: '#cc2200' },
  disposal: { label: 'Disposal Pipe', color: '#886644' },
};

export interface PaletteItem {
  type: 'tile' | 'entity' | 'decal';
  id: string; // tile ID or entity prototype ID
}

export interface TileChange {
  x: number;
  y: number;
  before: TileCell;
  after: TileCell;
}

export interface EntityChange {
  action: 'add' | 'remove';
  entity: import('./import/mapImporter').ImportedEntity;
}

export interface ContainedEntityChange {
  action: 'add' | 'remove';
  parentUid: number;
  entity: import('./import/mapImporter').ImportedEntity;
  previousParentComponents?: Record<string, unknown>[];
}

export interface DecalChange {
  action: 'add' | 'remove' | 'update';
  decal: import('./import/decalParser').DecalInstance;
  previousDecal?: import('./import/decalParser').DecalInstance; // for undo of 'update'
}

export interface Command {
  label: string;
  tileChanges: TileChange[];
  entityChanges: EntityChange[];
  containedEntityChanges?: ContainedEntityChange[];
  decalChanges?: DecalChange[];
  /** When present, undo/redo targets this specific grid. When absent, targets active grid. */
  gridUid?: number;
}

export interface GridCommand {
  type: 'ADD_GRID' | 'REMOVE_GRID' | 'RENAME_GRID';
  gridData: import('./state/gridData').GridData;
  previousName?: string;    // for undo of rename
  insertIndex?: number;     // where the grid was in the array (for undo of remove)
}

export type UndoableCommand = Command | GridCommand;
