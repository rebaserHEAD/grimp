import { describe, it, expect } from 'vitest';
import { serializeDecalGrid } from '../decalExporter';
import { parseDecalGrid, type DecalInstance } from '../../import/decalParser';
import yaml from 'js-yaml';
import { SS14_SCHEMA } from '../../import/ss14Schema';

function makeDecal(overrides: Partial<DecalInstance> & { id: number; prototypeId: string; position: { x: number; y: number } }): DecalInstance {
  return {
    color: null,
    angle: 0,
    zIndex: 0,
    cleanable: false,
    ...overrides,
  };
}

describe('serializeDecalGrid', () => {
  it('produces minimal DecalGrid with empty nodes for empty array', () => {
    const lines = serializeDecalGrid([]);
    expect(lines).toEqual([
      '    - type: DecalGrid',
      '      chunkCollection:',
      '        version: 2',
      '        nodes: []',
    ]);
  });

  it('serializes a single decal with default properties', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 0, prototypeId: 'Arrows', position: { x: 5, y: 5 } }),
    ];
    const lines = serializeDecalGrid(decals);

    expect(lines).toContain('    - type: DecalGrid');
    expect(lines).toContain('        nodes:');
    // No color, angle, zIndex, cleanable lines
    expect(lines.find(l => l.includes('color:'))).toBeUndefined();
    expect(lines.find(l => l.includes('angle:'))).toBeUndefined();
    expect(lines.find(l => l.includes('zIndex:'))).toBeUndefined();
    expect(lines.find(l => l.includes('cleanable:'))).toBeUndefined();
    // Has id and decal entry
    expect(lines).toContain('            id: Arrows');
    expect(lines).toContain('            0: 5,5');
  });

  it('serializes a single decal with all properties set', () => {
    const decals: DecalInstance[] = [
      makeDecal({
        id: 42,
        prototypeId: 'ArrowsGreyscale',
        position: { x: 10.5, y: -3.25 },
        color: '#FF0000FF',
        angle: 3.141592653589793,
        zIndex: 2,
        cleanable: true,
      }),
    ];
    const lines = serializeDecalGrid(decals);

    expect(lines).toContain('            cleanable: True');
    expect(lines).toContain('            angle: 3.141592653589793 rad');
    expect(lines).toContain('            zIndex: 2');
    expect(lines).toContain("            color: '#FF0000FF'");
    expect(lines).toContain('            id: ArrowsGreyscale');
    expect(lines).toContain('            42: 10.5,-3.25');
  });

  it('groups multiple decals with same properties into one node', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 100, prototypeId: 'Arrows', position: { x: 5, y: 5 }, color: '#FFFFFFFF' }),
      makeDecal({ id: 101, prototypeId: 'Arrows', position: { x: 6, y: 5 }, color: '#FFFFFFFF' }),
    ];
    const lines = serializeDecalGrid(decals);

    // Should only have one "- node:" entry
    const nodeLines = lines.filter(l => l.trim() === '- node:');
    expect(nodeLines).toHaveLength(1);

    // Both decal entries present
    expect(lines).toContain('            100: 5,5');
    expect(lines).toContain('            101: 6,5');
  });

  it('produces separate nodes for decals with different properties', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 100, prototypeId: 'Arrows', position: { x: 5, y: 5 } }),
      makeDecal({ id: 101, prototypeId: 'BotGreyscale', position: { x: 6, y: 5 } }),
    ];
    const lines = serializeDecalGrid(decals);

    // Should have two "- node:" entries
    const nodeLines = lines.filter(l => l.trim() === '- node:');
    expect(nodeLines).toHaveLength(2);

    expect(lines).toContain('            id: Arrows');
    expect(lines).toContain('            id: BotGreyscale');
  });

  it('formats non-zero angle with " rad" suffix', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 0, prototypeId: 'Test', position: { x: 0, y: 0 }, angle: 1.5707963267948966 }),
    ];
    const lines = serializeDecalGrid(decals);
    expect(lines).toContain('            angle: 1.5707963267948966 rad');
  });

  it('formats color as single-quoted hex string', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 0, prototypeId: 'Test', position: { x: 0, y: 0 }, color: '#00FF00FF' }),
    ];
    const lines = serializeDecalGrid(decals);
    expect(lines).toContain("            color: '#00FF00FF'");
  });

  it('formats cleanable as "True" with capital T', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 0, prototypeId: 'Test', position: { x: 0, y: 0 }, cleanable: true }),
    ];
    const lines = serializeDecalGrid(decals);
    expect(lines).toContain('            cleanable: True');
  });

  it('property order: cleanable, angle, zIndex, color, id', () => {
    const decals: DecalInstance[] = [
      makeDecal({
        id: 0,
        prototypeId: 'Test',
        position: { x: 0, y: 0 },
        color: '#FFFFFFFF',
        angle: 1.5,
        zIndex: 3,
        cleanable: true,
      }),
    ];
    const lines = serializeDecalGrid(decals);

    const nodeStart = lines.indexOf('        - node:');
    expect(nodeStart).toBeGreaterThan(-1);

    // Collect property lines after "- node:"
    const propLines: string[] = [];
    for (let i = nodeStart + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('decals:')) break;
      propLines.push(trimmed);
    }

    expect(propLines[0]).toMatch(/^cleanable:/);
    expect(propLines[1]).toMatch(/^angle:/);
    expect(propLines[2]).toMatch(/^zIndex:/);
    expect(propLines[3]).toMatch(/^color:/);
    expect(propLines[4]).toMatch(/^id:/);
  });

  it('sorts decals by ID within a node', () => {
    const decals: DecalInstance[] = [
      makeDecal({ id: 50, prototypeId: 'Test', position: { x: 3, y: 3 } }),
      makeDecal({ id: 10, prototypeId: 'Test', position: { x: 1, y: 1 } }),
      makeDecal({ id: 30, prototypeId: 'Test', position: { x: 2, y: 2 } }),
    ];
    const lines = serializeDecalGrid(decals);

    const decalEntries = lines.filter(l => /^\s+\d+: /.test(l));
    const ids = decalEntries.map(l => parseInt(l.trim().split(':')[0], 10));
    expect(ids).toEqual([10, 30, 50]);
  });

  it('roundtrip: serialized output can be parsed back with matching decals', () => {
    const original: DecalInstance[] = [
      makeDecal({ id: 100, prototypeId: 'Arrows', position: { x: 5, y: 5 }, color: '#FFFFFFFF' }),
      makeDecal({ id: 101, prototypeId: 'Arrows', position: { x: 6, y: 5 }, color: '#FFFFFFFF' }),
      makeDecal({
        id: 102,
        prototypeId: 'ArrowsGreyscale',
        position: { x: 10, y: 10 },
        color: '#FF0000FF',
        angle: 3.141592653589793,
        zIndex: 0,
        cleanable: false,
      }),
    ];

    const lines = serializeDecalGrid(original);
    // Build a YAML string from the lines, stripping the "    - " component prefix
    // to get just the component body
    const yamlStr = lines.join('\n');

    // Parse it as a YAML sequence element (component in the components array)
    // We wrap in a doc structure that yaml.load can handle
    const docStr = `components:\n${yamlStr}`;
    const doc = yaml.load(docStr, { schema: SS14_SCHEMA }) as Record<string, unknown>;
    const components = doc.components as Record<string, unknown>[];
    const decalComp = components[0];

    expect(decalComp).toBeDefined();
    expect((decalComp as Record<string, unknown>).type).toBe('DecalGrid');

    const result = parseDecalGrid(decalComp as Record<string, unknown>);
    expect(result.decals).toHaveLength(3);

    // Sort both by id for comparison
    const sortedOriginal = [...original].sort((a, b) => a.id - b.id);
    const sortedResult = [...result.decals].sort((a, b) => a.id - b.id);

    for (let i = 0; i < sortedOriginal.length; i++) {
      expect(sortedResult[i].id).toBe(sortedOriginal[i].id);
      expect(sortedResult[i].prototypeId).toBe(sortedOriginal[i].prototypeId);
      expect(sortedResult[i].position.x).toBeCloseTo(sortedOriginal[i].position.x);
      expect(sortedResult[i].position.y).toBeCloseTo(sortedOriginal[i].position.y);
      expect(sortedResult[i].angle).toBeCloseTo(sortedOriginal[i].angle);
      expect(sortedResult[i].cleanable).toBe(sortedOriginal[i].cleanable);
      expect(sortedResult[i].zIndex).toBe(sortedOriginal[i].zIndex);
      // Color: null vs string comparison
      if (sortedOriginal[i].color !== null) {
        expect(sortedResult[i].color).toBe(sortedOriginal[i].color);
      }
    }
  });
});
