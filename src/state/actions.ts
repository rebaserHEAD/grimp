import type { ToolType, PaletteItem, Command } from '../types';
import type { ImportedMap } from '../import/mapImporter';
import type { IPrototypeRegistry } from '../loaders/registryTypes';

export type EditorAction =
  | { type: 'APPLY_COMMAND'; command: Command }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_TOOL'; tool: ToolType }
  | { type: 'SET_PALETTE_ITEM'; item: PaletteItem }
  | { type: 'LOAD_MAP'; map: ImportedMap }
  | { type: 'NEW_MAP' }
  | { type: 'NEW_GRID' }
  | { type: 'SET_REGISTRY'; registry: IPrototypeRegistry | null }
  | { type: 'SELECT_ENTITY'; uids: number[] }
  | { type: 'TOGGLE_SELECT_ENTITY'; uid: number }
  | { type: 'ADD_SELECT_ENTITIES'; uids: number[] }
  | { type: 'REMOVE_SELECT_ENTITIES'; uids: number[] }
  | { type: 'SELECT_DECAL'; ids: number[] }
  | { type: 'TOGGLE_SELECT_DECAL'; id: number }
  | { type: 'ADD_SELECT_DECALS'; ids: number[] }
  | { type: 'REMOVE_SELECT_DECALS'; ids: number[] }
  | { type: 'ADD_CONTAINED_ENTITY'; parentUid: number; prototypeId: string }
  | { type: 'REMOVE_CONTAINED_ENTITY'; parentUid: number; entityUid: number }
  | { type: 'SET_LIGHTING_ENABLED'; enabled: boolean }
  | { type: 'SET_ACTIVE_GRID'; index: number }
  | { type: 'ADD_GRID'; name: string; worldPosition?: { x: number; y: number } }
  | { type: 'REMOVE_GRID'; gridUid: number }
  | { type: 'RENAME_GRID'; gridUid: number; name: string };
