/**
 * Prefab file I/O, serialisation, parsing, and browser download.
 */

import type { PrefabData } from './prefabTypes';

/** Serialise a prefab to a pretty-printed JSON string. */
export function stringifyPrefab(prefab: PrefabData): string {
  return JSON.stringify(prefab, null, 2);
}

/** Parse a JSON string into a PrefabData, with validation. */
export function parsePrefabJson(json: string): PrefabData {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }

  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    throw new Error('Prefab JSON must be an object');
  }

  const o = obj as Record<string, unknown>;

  // Required fields
  if (typeof o.name !== 'string') {
    throw new Error('Missing or invalid required field: name (expected string)');
  }
  if (typeof o.width !== 'number') {
    throw new Error('Missing or invalid required field: width (expected number)');
  }
  if (typeof o.height !== 'number') {
    throw new Error('Missing or invalid required field: height (expected number)');
  }
  if (!Array.isArray(o.tiles)) {
    throw new Error('Missing or invalid required field: tiles (expected array)');
  }
  if (!Array.isArray(o.entities)) {
    throw new Error('Missing or invalid required field: entities (expected array)');
  }
  if (!Array.isArray(o.deviceLinks)) {
    throw new Error('Missing or invalid required field: deviceLinks (expected array)');
  }

  return o as unknown as PrefabData;
}

/** Trigger a browser download of the prefab as a .json file. */
export function downloadPrefab(prefab: PrefabData, filename: string): void {
  const json = stringifyPrefab(prefab);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
