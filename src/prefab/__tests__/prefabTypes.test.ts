import { describe, it, expect } from 'vitest';
import type { PrefabData, PrefabTile, PrefabEntity, PrefabDeviceLink } from '../prefabTypes';

describe('PrefabData types', () => {
  it('round-trips through JSON.stringify/parse', () => {
    const prefab: PrefabData = {
      name: 'TestRoom',
      width: 3,
      height: 2,
      tiles: [
        { dx: 0, dy: 0, tileId: 'FloorSteel' },
        { dx: 1, dy: 0, tileId: 'Plating' },
        { dx: 2, dy: 1, tileId: 'FloorWood' },
      ],
      entities: [
        {
          dx: 0,
          dy: 0,
          prototype: 'APCBasic',
          rotation: 0,
          components: [{ type: 'Transform' }],
          rawYamlLines: ['  - type: Transform', '    pos: 0.5,0.5'],
        },
        {
          dx: 1,
          dy: 1,
          prototype: 'GasVentPump',
          rotation: 1.5707963267948966,
          components: [{ type: 'Transform' }, { type: 'AtmosPipeColor', color: '#0055CCFF' }],
        },
      ],
      deviceLinks: [
        { sourceIdx: 0, targetIdx: 1, port: 'Pressed', sink: 'Toggle' },
      ],
    };

    const json = JSON.stringify(prefab);
    const parsed: PrefabData = JSON.parse(json);

    expect(parsed.name).toBe('TestRoom');
    expect(parsed.width).toBe(3);
    expect(parsed.height).toBe(2);
    expect(parsed.tiles).toHaveLength(3);
    expect(parsed.tiles[0]).toEqual({ dx: 0, dy: 0, tileId: 'FloorSteel' });
    expect(parsed.entities).toHaveLength(2);
    expect(parsed.entities[0].rawYamlLines).toEqual([
      '  - type: Transform',
      '    pos: 0.5,0.5',
    ]);
    expect(parsed.entities[1].rotation).toBeCloseTo(Math.PI / 2);
    expect(parsed.deviceLinks).toHaveLength(1);
    expect(parsed.deviceLinks[0]).toEqual({
      sourceIdx: 0,
      targetIdx: 1,
      port: 'Pressed',
      sink: 'Toggle',
    });
  });

  it('represents an empty prefab', () => {
    const empty: PrefabData = {
      name: 'Empty',
      width: 0,
      height: 0,
      tiles: [],
      entities: [],
      deviceLinks: [],
    };

    const json = JSON.stringify(empty);
    const parsed: PrefabData = JSON.parse(json);

    expect(parsed.name).toBe('Empty');
    expect(parsed.width).toBe(0);
    expect(parsed.height).toBe(0);
    expect(parsed.tiles).toEqual([]);
    expect(parsed.entities).toEqual([]);
    expect(parsed.deviceLinks).toEqual([]);
  });
});
