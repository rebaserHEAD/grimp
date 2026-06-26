import { describe, it, expect } from 'vitest';
import { stringifyPrefab, parsePrefabJson } from '../prefabIO';
import type { PrefabData } from '../prefabTypes';

function makePrefab(): PrefabData {
  return {
    name: 'test',
    width: 3,
    height: 2,
    tiles: [{ dx: 0, dy: 0, tileId: 'FloorSteel' }],
    entities: [
      { dx: 1, dy: 0, prototype: 'APCBasic', rotation: 0, components: [{ type: 'Transform' }] },
    ],
    deviceLinks: [
      { sourceIdx: 0, targetIdx: 0, port: 'Pressed', sink: 'Toggle' },
    ],
  };
}

describe('stringifyPrefab / parsePrefabJson roundtrip', () => {
  it('round-trips a prefab through JSON', () => {
    const original = makePrefab();
    const json = stringifyPrefab(original);
    const parsed = parsePrefabJson(json);
    expect(parsed).toEqual(original);
  });

  it('produces pretty-printed JSON', () => {
    const json = stringifyPrefab(makePrefab());
    // Pretty-printed JSON has newlines and indentation
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });
});

describe('parsePrefabJson validation', () => {
  it('throws on invalid JSON', () => {
    expect(() => parsePrefabJson('not json {')).toThrow('Invalid JSON');
  });

  it('throws on non-object JSON (array)', () => {
    expect(() => parsePrefabJson('[]')).toThrow('must be an object');
  });

  it('throws on non-object JSON (string)', () => {
    expect(() => parsePrefabJson('"hello"')).toThrow('must be an object');
  });

  it('throws on non-object JSON (null)', () => {
    expect(() => parsePrefabJson('null')).toThrow('must be an object');
  });

  it('throws when name is missing', () => {
    const obj = { width: 1, height: 1, tiles: [], entities: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('name');
  });

  it('throws when name is wrong type', () => {
    const obj = { name: 123, width: 1, height: 1, tiles: [], entities: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('name');
  });

  it('throws when width is missing', () => {
    const obj = { name: 'x', height: 1, tiles: [], entities: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('width');
  });

  it('throws when width is wrong type', () => {
    const obj = { name: 'x', width: '3', height: 1, tiles: [], entities: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('width');
  });

  it('throws when height is missing', () => {
    const obj = { name: 'x', width: 1, tiles: [], entities: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('height');
  });

  it('throws when tiles is not an array', () => {
    const obj = { name: 'x', width: 1, height: 1, tiles: 'bad', entities: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('tiles');
  });

  it('throws when entities is missing', () => {
    const obj = { name: 'x', width: 1, height: 1, tiles: [], deviceLinks: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('entities');
  });

  it('throws when deviceLinks is missing', () => {
    const obj = { name: 'x', width: 1, height: 1, tiles: [], entities: [] };
    expect(() => parsePrefabJson(JSON.stringify(obj))).toThrow('deviceLinks');
  });

  it('accepts a valid minimal prefab', () => {
    const obj = { name: 'min', width: 0, height: 0, tiles: [], entities: [], deviceLinks: [] };
    const result = parsePrefabJson(JSON.stringify(obj));
    expect(result.name).toBe('min');
  });
});
