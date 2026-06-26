/**
 * Serializes DecalInstance[] into SS14's DecalGrid YAML format.
 *
 * SS14 groups decals into "nodes" where each node has shared properties
 * (prototypeId, color, angle, zIndex, cleanable) and a `decals` map
 * keyed by instance ID with "x,y" position strings.
 */

import type { DecalInstance } from '../import/decalParser';

/**
 * Build a grouping key from shared decal properties.
 * Decals with identical keys share a node in the output.
 */
function nodeKey(d: DecalInstance): string {
  return `${d.prototypeId}|${d.color ?? ''}|${d.angle}|${d.zIndex}|${d.cleanable}`;
}

/**
 * Format a number for coordinate output.
 * Uses toString() to match SS14's raw float formatting.
 */
function formatCoord(n: number): string {
  return String(n);
}

/**
 * Serialize an array of DecalInstance into SS14 DecalGrid YAML lines.
 *
 * Returns an array of YAML lines with proper indentation (4 spaces for
 * component level, matching structural entity component indentation).
 */
export function serializeDecalGrid(decals: DecalInstance[]): string[] {
  if (decals.length === 0) {
    return [
      '    - type: DecalGrid',
      '      chunkCollection:',
      '        version: 2',
      '        nodes: []',
    ];
  }

  // Group decals by shared properties
  const groups = new Map<string, DecalInstance[]>();
  for (const d of decals) {
    const key = nodeKey(d);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(d);
  }

  const lines: string[] = [
    '    - type: DecalGrid',
    '      chunkCollection:',
    '        version: 2',
    '        nodes:',
  ];

  for (const group of groups.values()) {
    // Use first decal as representative for shared properties
    const rep = group[0];

    lines.push('        - node:');

    // Property order: cleanable, angle, zIndex, color, id
    if (rep.cleanable) {
      lines.push('            cleanable: True');
    }
    if (rep.angle !== 0) {
      lines.push(`            angle: ${rep.angle} rad`);
    }
    if (rep.zIndex !== 0) {
      lines.push(`            zIndex: ${rep.zIndex}`);
    }
    if (rep.color !== null) {
      lines.push(`            color: '${rep.color}'`);
    }
    lines.push(`            id: ${rep.prototypeId}`);

    lines.push('          decals:');

    // Sort decals by ID for deterministic output
    const sorted = [...group].sort((a, b) => a.id - b.id);
    for (const d of sorted) {
      lines.push(`            ${d.id}: ${formatCoord(d.position.x)},${formatCoord(d.position.y)}`);
    }
  }

  return lines;
}
