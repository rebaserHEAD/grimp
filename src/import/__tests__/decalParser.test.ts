import { describe, it, expect } from 'vitest';
import { parseDecalGrid, type DecalInstance } from '../decalParser';

describe('parseDecalGrid', () => {
  it('returns empty data for missing chunkCollection', () => {
    const result = parseDecalGrid({});
    expect(result.decals).toEqual([]);
    expect(result.nextDecalId).toBe(0);
  });

  it('returns empty data for empty chunkCollection', () => {
    const result = parseDecalGrid({ chunkCollection: {} });
    expect(result.decals).toEqual([]);
    expect(result.nextDecalId).toBe(0);
  });

  it('returns empty data for empty nodes array', () => {
    const result = parseDecalGrid({
      chunkCollection: { version: 2, nodes: [] },
    });
    expect(result.decals).toEqual([]);
    expect(result.nextDecalId).toBe(0);
  });

  it('parses a single node with one decal correctly', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        version: 2,
        nodes: [
          {
            node: {
              color: '#FFFFFFFF',
              id: 'Arrows',
              angle: '3.14 rad',
              zIndex: 5,
              cleanable: true,
            },
            decals: {
              100: '5.5,3.5',
            },
          },
        ],
      },
    });

    expect(result.decals).toHaveLength(1);
    const d = result.decals[0];
    expect(d.id).toBe(100);
    expect(d.prototypeId).toBe('Arrows');
    expect(d.position).toEqual({ x: 5.5, y: 3.5 });
    expect(d.color).toBe('#FFFFFFFF');
    expect(d.angle).toBeCloseTo(3.14);
    expect(d.zIndex).toBe(5);
    expect(d.cleanable).toBe(true);
    expect(result.nextDecalId).toBe(101);
  });

  it('parses multiple decals sharing a node', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        version: 2,
        nodes: [
          {
            node: { id: 'BotGreyscale', color: '#FF0000FF' },
            decals: {
              10: '1,2',
              20: '3,4',
              15: '5,6',
            },
          },
        ],
      },
    });

    expect(result.decals).toHaveLength(3);
    // All share node properties
    for (const d of result.decals) {
      expect(d.prototypeId).toBe('BotGreyscale');
      expect(d.color).toBe('#FF0000FF');
    }
    // nextDecalId from highest key (20)
    expect(result.nextDecalId).toBe(21);
  });

  it('parses angle from "N rad" string format', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          {
            node: { id: 'Test', angle: '1.5707963267948966 rad' },
            decals: { 0: '0,0' },
          },
        ],
      },
    });
    expect(result.decals[0].angle).toBeCloseTo(1.5707963267948966);
  });

  it('parses angle from numeric format', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          {
            node: { id: 'Test', angle: 3.14159 },
            decals: { 0: '0,0' },
          },
        ],
      },
    });
    expect(result.decals[0].angle).toBeCloseTo(3.14159);
  });

  it('parses zIndex from node', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          {
            node: { id: 'Test', zIndex: -2 },
            decals: { 0: '0,0' },
          },
        ],
      },
    });
    expect(result.decals[0].zIndex).toBe(-2);
  });

  it('parses cleanable boolean true', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          {
            node: { id: 'Test', cleanable: true },
            decals: { 0: '0,0' },
          },
        ],
      },
    });
    expect(result.decals[0].cleanable).toBe(true);
  });

  it('parses cleanable string "True"', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          {
            node: { id: 'Test', cleanable: 'True' },
            decals: { 0: '0,0' },
          },
        ],
      },
    });
    expect(result.decals[0].cleanable).toBe(true);
  });

  it('defaults missing optional fields correctly', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          {
            node: { id: 'Minimal' },
            decals: { 5: '10,20' },
          },
        ],
      },
    });

    const d = result.decals[0];
    expect(d.color).toBeNull();
    expect(d.angle).toBe(0);
    expect(d.zIndex).toBe(0);
    expect(d.cleanable).toBe(false);
  });

  it('flattens multiple nodes into a single array', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        version: 2,
        nodes: [
          {
            node: { id: 'Arrows', color: '#FFFFFFFF' },
            decals: { 100: '1,1', 101: '2,2' },
          },
          {
            node: { id: 'BotGreyscale', zIndex: 3 },
            decals: { 200: '5,5' },
          },
        ],
      },
    });

    expect(result.decals).toHaveLength(3);

    const arrows = result.decals.filter((d) => d.prototypeId === 'Arrows');
    const bots = result.decals.filter((d) => d.prototypeId === 'BotGreyscale');
    expect(arrows).toHaveLength(2);
    expect(bots).toHaveLength(1);
    expect(bots[0].zIndex).toBe(3);
  });

  it('computes nextDecalId as highest ID + 1', () => {
    const result = parseDecalGrid({
      chunkCollection: {
        nodes: [
          { node: { id: 'A' }, decals: { 5: '0,0', 50: '1,1' } },
          { node: { id: 'B' }, decals: { 30: '2,2' } },
        ],
      },
    });
    expect(result.nextDecalId).toBe(51);
  });
});
