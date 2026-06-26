/**
 * Parses DecalGrid components from SS14 map YAML into flat decal arrays.
 *
 * SS14 groups decals into "nodes" where each node carries shared visual
 * properties (color, angle, zIndex, cleanable, prototype id) and a `decals`
 * map keyed by unique instance ID with "x,y" position strings.
 */

export interface DecalInstance {
  id: number;
  prototypeId: string;
  position: { x: number; y: number };
  color: string | null;
  angle: number;
  zIndex: number;
  cleanable: boolean;
}

export interface GridDecalData {
  decals: DecalInstance[];
  nextDecalId: number;
}

function parseAngle(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.endsWith(' rad')) {
      return parseFloat(trimmed.slice(0, -4));
    }
    return parseFloat(trimmed) || 0;
  }
  return 0;
}

function parseCleanable(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === 'string' && raw.toLowerCase() === 'true') return true;
  return false;
}

function parsePosition(raw: string): { x: number; y: number } {
  const parts = raw.split(',');
  return {
    x: parseFloat(parts[0]),
    y: parseFloat(parts[1]),
  };
}

export function parseDecalGrid(component: Record<string, unknown>): GridDecalData {
  const chunkCollection = component.chunkCollection as Record<string, unknown> | undefined;
  if (!chunkCollection) {
    return { decals: [], nextDecalId: 0 };
  }

  const nodes = chunkCollection.nodes as Array<Record<string, unknown>> | undefined;
  if (!nodes || nodes.length === 0) {
    return { decals: [], nextDecalId: 0 };
  }

  const decals: DecalInstance[] = [];
  let maxId = -1;

  for (const entry of nodes) {
    const node = entry.node as Record<string, unknown>;
    if (!node) continue;

    const prototypeId = (node.id as string) ?? '';
    const color = (node.color as string) ?? null;
    const angle = parseAngle(node.angle);
    const zIndex = typeof node.zIndex === 'number' ? node.zIndex : 0;
    const cleanable = parseCleanable(node.cleanable);

    const decalMap = entry.decals as Record<string, string> | undefined;
    if (!decalMap) continue;

    for (const [idStr, posStr] of Object.entries(decalMap)) {
      const id = parseInt(idStr, 10);
      if (id > maxId) maxId = id;

      decals.push({
        id,
        prototypeId,
        position: parsePosition(posStr),
        color,
        angle,
        zIndex,
        cleanable,
      });
    }
  }

  return {
    decals,
    nextDecalId: maxId >= 0 ? maxId + 1 : 0,
  };
}
