import type { ImportedEntity } from '../import/mapImporter';
import type { TileGrid } from '../types';
import type { IPrototypeRegistry } from '../loaders/registryTypes';
import { getCell } from '../state/editorState';

export interface AutoLinkResult {
  updatedEntity: ImportedEntity;
  linkedCount: number;
}

const AIR_ALARM_TARGETS = ['GasVentPump', 'GasVentScrubber', 'AirSensor'];
const FIRE_ALARM_TARGETS = ['Firelock'];

/** Check if an entity is a wall (blocks flood fill). */
function isWallEntity(prototype: string, registry: IPrototypeRegistry): boolean {
  if (prototype.includes('Wall')) return true;
  const resolved = registry.getEntity(prototype);
  if (resolved) {
    return resolved.components.some(c => c.type === 'Occluder');
  }
  return false;
}

/** Check if an entity is a door/firelock (boundary for flood fill). */
function isDoorEntity(prototype: string): boolean {
  return prototype.includes('Airlock') || prototype.includes('Firelock');
}

/**
 * BFS flood fill from a starting tile position.
 * Spreads through walkable tiles, stops at walls, doors, Space,
 * and tiles beyond maxDistance from the start.
 */
export function floodFillRoom(
  startX: number, startY: number,
  grid: TileGrid, entities: ImportedEntity[],
  registry: IPrototypeRegistry,
  maxTiles: number = 200,
  maxDistance: number = 8,
): { roomTiles: Set<string>; boundaryTiles: Set<string> } {
  const roomTiles = new Set<string>();
  const boundaryTiles = new Set<string>();
  const visited = new Set<string>();

  // Build entity lookup by tile position
  const entityByTile = new Map<string, ImportedEntity[]>();
  for (const e of entities) {
    const key = `${Math.floor(e.position.x)},${Math.floor(e.position.y)}`;
    if (!entityByTile.has(key)) entityByTile.set(key, []);
    entityByTile.get(key)!.push(e);
  }

  // Start tile is always included (alarm may be wallmounted on a wall tile).
  // Seed the queue with the start tile AND its 4 neighbors so the flood
  // expands into the adjacent room even if the start is on a wall.
  const startKey = `${startX},${startY}`;
  roomTiles.add(startKey);
  visited.add(startKey);
  const seedPositions: [number, number][] = [
    [startX, startY],
    [startX + 1, startY], [startX - 1, startY],
    [startX, startY + 1], [startX, startY - 1],
  ];
  const queue: [number, number][] = [];
  for (const [sx, sy] of seedPositions) {
    const sk = `${sx},${sy}`;
    if (!visited.has(sk)) {
      visited.add(sk);
      queue.push([sx, sy]);
    }
  }

  while (queue.length > 0 && roomTiles.size < maxTiles) {
    const [x, y] = queue.shift()!;
    const key = `${x},${y}`;

    // Distance limit, stop expanding beyond maxDistance from start
    const dist = Math.abs(x - startX) + Math.abs(y - startY);
    if (dist > maxDistance) {
      boundaryTiles.add(key);
      continue;
    }

    // Check if this tile is walkable
    const cell = getCell(grid, x, y);
    if (!cell || cell.tileId === 'Space') {
      boundaryTiles.add(key);
      continue;
    }

    // Check for wall or door entities at this tile
    const tileEntities = entityByTile.get(key) ?? [];
    let isWall = false;
    let isDoor = false;
    for (const e of tileEntities) {
      if (isWallEntity(e.prototype, registry)) { isWall = true; break; }
      if (isDoorEntity(e.prototype)) { isDoor = true; }
    }

    if (isWall || isDoor) {
      boundaryTiles.add(key);
      continue;
    }

    roomTiles.add(key);

    // Expand to 4-directional neighbors
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = `${nx},${ny}`;
      if (!visited.has(nk)) {
        visited.add(nk);
        queue.push([nx, ny]);
      }
    }
  }

  return { roomTiles, boundaryTiles };
}

/**
 * Auto-link a DeviceList entity to compatible entities in the same room.
 * Uses flood fill for room detection. Checks prototype registry for DeviceList.
 */
export function autoLinkDeviceList(
  entity: ImportedEntity,
  allEntities: ImportedEntity[],
  grid: TileGrid,
  registry: IPrototypeRegistry,
): AutoLinkResult | null {
  // 1. Determine alarm type
  let targetPatterns: string[];
  let useRoomTiles: boolean;
  if (entity.prototype.includes('AirAlarm')) {
    targetPatterns = AIR_ALARM_TARGETS;
    useRoomTiles = true;
  } else if (entity.prototype.includes('FireAlarm')) {
    targetPatterns = FIRE_ALARM_TARGETS;
    useRoomTiles = false;
  } else {
    return null;
  }

  // 2. Check for DeviceList, instance first, then prototype
  let deviceListIndex = entity.components.findIndex(
    c => (c as Record<string, unknown>).type === 'DeviceList',
  );
  const hasProtoDeviceList = (() => {
    const resolved = registry.getEntity(entity.prototype);
    return resolved?.components.some(c => c.type === 'DeviceList') ?? false;
  })();

  if (deviceListIndex === -1 && !hasProtoDeviceList) return null;

  // 3. Get existing devices
  const deviceListComp = deviceListIndex >= 0
    ? entity.components[deviceListIndex] as Record<string, unknown>
    : null;
  const existingDevices: number[] = deviceListComp && Array.isArray(deviceListComp.devices)
    ? (deviceListComp.devices as number[])
    : [];
  const existingSet = new Set(existingDevices);

  // 4. Flood fill room from entity position
  const startX = Math.floor(entity.position.x);
  const startY = Math.floor(entity.position.y);
  const { roomTiles, boundaryTiles } = floodFillRoom(startX, startY, grid, allEntities, registry);
  const searchTiles = useRoomTiles ? roomTiles : boundaryTiles;


  // 5. Find matching entities in the room/boundary
  const newDeviceUids: number[] = [];
  for (const other of allEntities) {
    if (other.uid === entity.uid) continue;
    if (existingSet.has(other.uid)) continue;

    const matches = targetPatterns.some(p => other.prototype.includes(p));
    if (!matches) continue;

    const otherKey = `${Math.floor(other.position.x)},${Math.floor(other.position.y)}`;
    if (!searchTiles.has(otherKey)) continue;

    newDeviceUids.push(other.uid);
  }

  if (newDeviceUids.length === 0) return null;

  // 6. Build updated entity
  const updatedDeviceList: Record<string, unknown> = {
    ...(deviceListComp ?? {}),
    type: 'DeviceList',
    devices: [...existingDevices, ...newDeviceUids],
  };

  let updatedComponents: Record<string, unknown>[];
  if (deviceListIndex >= 0) {
    updatedComponents = entity.components.map((c, i) =>
      i === deviceListIndex ? updatedDeviceList : c,
    );
  } else {
    updatedComponents = [...entity.components, updatedDeviceList];
  }

  return {
    updatedEntity: { ...entity, components: updatedComponents },
    linkedCount: newDeviceUids.length,
  };
}
