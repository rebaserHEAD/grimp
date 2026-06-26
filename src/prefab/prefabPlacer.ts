/**
 * Converts a PrefabData + placement position into a Command that can be
 * dispatched as APPLY_COMMAND to the editor reducer.
 */

import type { TileGrid, TileChange, EntityChange, Command, TileCell } from '../types';
import type { ImportedEntity } from '../import/mapImporter';
import type { PrefabData } from './prefabTypes';
import { getCell } from '../state/editorState';
import { cloneComponentsWithPosRot } from '../tools/entityHelpers';

export interface PlacePrefabInput {
  prefab: PrefabData;
  placeX: number;
  placeY: number;
  grid: TileGrid;
  entities: ImportedEntity[];
  nextEntityId: number;
}

export interface ResolvedDeviceLink {
  sourceUid: number;
  targetUid: number;
  port: string;
  sink: string;
}

export interface PlacePrefabResult {
  command: Command;
  rawComponentsMap: Record<number, string[]>;
  resolvedDeviceLinks: ResolvedDeviceLink[];
  nextEntityId: number;
}

const SPACE_CELL: TileCell = { tileId: 'Space' };

export function placePrefab(input: PlacePrefabInput): PlacePrefabResult {
  const { prefab, placeX, placeY, grid, entities, nextEntityId } = input;

  // 1. Tile changes
  const tileChanges: TileChange[] = [];
  for (const tile of prefab.tiles) {
    const wx = placeX + tile.dx;
    const wy = placeY + tile.dy;
    const before = getCell(grid, wx, wy) ?? { ...SPACE_CELL };
    const after: TileCell = { tileId: tile.tileId };
    tileChanges.push({ x: wx, y: wy, before, after });
  }

  // 2. Entity removals, find existing entities within the prefab footprint
  const entityRemovals: EntityChange[] = [];
  const minX = placeX;
  const maxX = placeX + prefab.width - 1;
  const minY = placeY;
  const maxY = placeY + prefab.height - 1;

  for (const ent of entities) {
    const tileX = Math.floor(ent.position.x);
    const tileY = Math.floor(ent.position.y);
    if (tileX >= minX && tileX <= maxX && tileY >= minY && tileY <= maxY) {
      entityRemovals.push({ action: 'remove', entity: ent });
    }
  }

  // 3. Entity additions, assign fresh UIDs
  const entityAdditions: EntityChange[] = [];
  const rawComponentsMap: Record<number, string[]> = {};
  let uid = nextEntityId;

  // Map from prefab entity index to new UID for device link resolution
  const indexToUid: number[] = [];

  for (const pe of prefab.entities) {
    const newUid = uid++;
    indexToUid.push(newUid);

    const newPos = { x: placeX + pe.dx + 0.5, y: placeY + pe.dy + 0.5 };
    const newEntity: ImportedEntity = {
      uid: newUid,
      prototype: pe.prototype,
      position: newPos,
      rotation: pe.rotation,
      components: cloneComponentsWithPosRot(pe.components, newPos, pe.rotation),
      ...(pe.spriteStateOverride ? { spriteStateOverride: pe.spriteStateOverride } : {}),
    };
    entityAdditions.push({ action: 'add', entity: newEntity });

    // Note: raw YAML lines from the prefab template are NOT preserved here because
    // entity positions have changed, the exporter must re-serialize from components
  }

  // 5. Device link resolution
  const resolvedDeviceLinks: ResolvedDeviceLink[] = prefab.deviceLinks.map((dl) => ({
    sourceUid: indexToUid[dl.sourceIdx],
    targetUid: indexToUid[dl.targetIdx],
    port: dl.port,
    sink: dl.sink,
  }));

  // 6. Build command
  const command: Command = {
    label: `Place prefab "${prefab.name}"`,
    tileChanges,
    entityChanges: [...entityRemovals, ...entityAdditions],
  };

  return {
    command,
    rawComponentsMap,
    resolvedDeviceLinks,
    nextEntityId: uid,
  };
}
