import { describe, it, expect } from 'vitest';
import {
  findComponentBlock,
  hasComponent,
  setComponentField,
  addComponent,
  removeComponent,
} from '../rawComponentPatch';

/**
 * Surgical edits to a structural entity's raw component lines (the verbatim
 * YAML block preserved for byte-exact round-trips). Edits must touch only
 * the targeted component block and leave every other line untouched, or
 * export parity dies for the whole file.
 */

function adjutantStyleRaw(): string[] {
  return [
    '    - type: MetaData',
    '      desc: A ship.',
    '      name: Adjutant',
    '    - type: Transform',
    '      parent: invalid',
    '    - type: MapGrid',
    '      chunks:',
    '        0,0:',
    '          ind: 0,0',
    '          tiles: AAAA',
    '          version: 7',
    '    - type: GridAtmosphere',
    '      version: 2',
    '      data:',
    '        tiles:',
    '          0,0:',
    '            0: 15',
  ];
}

describe('findComponentBlock', () => {
  it('finds start and end of a component block', () => {
    const range = findComponentBlock(adjutantStyleRaw(), 'Transform');
    expect(range).toEqual({ start: 3, end: 5 });
  });

  it('last block runs to end of lines', () => {
    const range = findComponentBlock(adjutantStyleRaw(), 'GridAtmosphere');
    expect(range).toEqual({ start: 11, end: 17 });
  });

  it('returns null for a missing component', () => {
    expect(findComponentBlock(adjutantStyleRaw(), 'Shuttle')).toBeNull();
  });

  it('does not match nested lines that merely contain type:', () => {
    const lines = [
      '    - type: MetaData',
      '      name: x',
      '    - type: DeviceNetwork',
      '      configurators:',
      '      - type: Foo', // nested list item at 6-space indent, not a component
    ];
    expect(findComponentBlock(lines, 'Foo')).toBeNull();
  });
});

describe('setComponentField', () => {
  it('replaces an existing scalar field in place', () => {
    const out = setComponentField(adjutantStyleRaw(), 'MetaData', 'name', 'Warspite');
    expect(out[2]).toBe('      name: Warspite');
    // Everything else untouched
    const orig = adjutantStyleRaw();
    orig[2] = out[2];
    expect(out).toEqual(orig);
  });

  it('inserts a new field alphabetically among top-level fields', () => {
    const lines = [
      '    - type: MetaData',
      '      name: Adjutant',
      '    - type: MapGrid',
    ];
    const out = setComponentField(lines, 'MetaData', 'desc', 'A ship.');
    expect(out).toEqual([
      '    - type: MetaData',
      '      desc: A ship.',
      '      name: Adjutant',
      '    - type: MapGrid',
    ]);
  });

  it('removes a field when value is null', () => {
    const out = setComponentField(adjutantStyleRaw(), 'MetaData', 'desc', null);
    expect(out.some(l => l.includes('desc:'))).toBe(false);
    expect(out).toHaveLength(adjutantStyleRaw().length - 1);
  });

  it('creates the component block when missing', () => {
    const lines = ['    - type: MapGrid'];
    const out = setComponentField(lines, 'MetaData', 'name', 'Warspite');
    expect(out).toEqual([
      '    - type: MapGrid',
      '    - type: MetaData',
      '      name: Warspite',
    ]);
  });

  it('quotes values that need YAML quoting', () => {
    const out = setComponentField(adjutantStyleRaw(), 'MetaData', 'name', 'a: b');
    expect(out[2]).toBe("      name: 'a: b'");
  });

  it('refuses to replace a non-scalar field', () => {
    // GridAtmosphere.data is a nested mapping; replacing its line alone would corrupt
    expect(() =>
      setComponentField(adjutantStyleRaw(), 'GridAtmosphere', 'data', 'x'),
    ).toThrow();
  });
});

describe('addComponent / removeComponent / hasComponent', () => {
  it('appends a bare component at the end', () => {
    const out = addComponent(adjutantStyleRaw(), 'Shuttle');
    expect(out[out.length - 1]).toBe('    - type: Shuttle');
  });

  it('add is a no-op when the component exists', () => {
    const out = addComponent(adjutantStyleRaw(), 'MapGrid');
    expect(out).toEqual(adjutantStyleRaw());
  });

  it('removes an entire block and nothing else', () => {
    const out = removeComponent(adjutantStyleRaw(), 'GridAtmosphere');
    expect(out).toEqual(adjutantStyleRaw().slice(0, 11));
  });

  it('remove is a no-op when the component is missing', () => {
    const out = removeComponent(adjutantStyleRaw(), 'Shuttle');
    expect(out).toEqual(adjutantStyleRaw());
  });

  it('hasComponent reports presence', () => {
    expect(hasComponent(adjutantStyleRaw(), 'MapGrid')).toBe(true);
    expect(hasComponent(adjutantStyleRaw(), 'Shuttle')).toBe(false);
  });
});
