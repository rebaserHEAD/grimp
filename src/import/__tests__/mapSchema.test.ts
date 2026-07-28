import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { validateMapDocument } from '../mapSchema';
import { importMap } from '../mapImporter';
import { SS14_SCHEMA } from '../ss14Schema';

const MINIMAL_GRID = `meta:
  format: 6
tilemap:
  0: Space
  1: FloorSteel
entities:
- proto: ""
  entities:
  - uid: 1
    components:
    - type: MetaData
    - type: Transform
    - type: MapGrid
      chunks:
        0,0:
          ind: 0,0
          tiles: ${'AAAAAA'.repeat(1)}
          version: 6
`;

describe('validateMapDocument', () => {
  it('accepts a minimal grid document', () => {
    const doc = yaml.load(MINIMAL_GRID, { schema: SS14_SCHEMA });
    expect(() => validateMapDocument(doc)).not.toThrow();
  });

  it('passes unknown top-level keys through untouched', () => {
    const doc = validateMapDocument({
      entities: [],
      someForkExtension: { anything: true },
    });
    expect(doc.someForkExtension).toEqual({ anything: true });
  });

  it('rejects a prototype file with a readable message', () => {
    // A prototype YAML parses to an array, not a mapping.
    const doc = yaml.load('- type: entity\n  id: MobHuman\n', { schema: SS14_SCHEMA });
    expect(() => validateMapDocument(doc)).toThrow(/Not a valid map\/grid file/);
  });

  it('rejects a document without entities', () => {
    expect(() => validateMapDocument({ meta: { format: 6 } })).toThrow(/entities/);
  });

  it('rejects entities with non-numeric uids, naming the path', () => {
    const doc = {
      entities: [{ proto: '', entities: [{ uid: 'one' }] }],
    };
    expect(() => validateMapDocument(doc)).toThrow(/uid/);
  });

  it('tolerates absent meta and tilemap (importer defaults them)', () => {
    expect(() => validateMapDocument({ entities: [] })).not.toThrow();
  });
});

describe('importMap with the schema gate', () => {
  it('still imports a minimal grid', () => {
    const map = importMap(MINIMAL_GRID);
    expect(map.meta.format).toBe(6);
    expect(map.tilemap[0]).toBe('Space');
  });

  it('turns a non-map file into a status-bar-sized error', () => {
    expect(() => importMap('- type: entity\n  id: MobHuman\n')).toThrow(/Not a valid map\/grid file/);
  });
});
