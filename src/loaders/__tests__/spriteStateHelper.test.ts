import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAvailableStates } from '../spriteStateHelper';
import type { IPrototypeRegistry } from '../registryTypes';
import type { RsiMeta } from '../rsiLoader';

vi.mock('../rsiLoader', () => ({
  loadRsiMeta: vi.fn(),
}));

import { loadRsiMeta } from '../rsiLoader';

const mockLoadRsiMeta = vi.mocked(loadRsiMeta);

function makeRegistry(spriteInfo: { rsiPath: string; baseState: string } | null): IPrototypeRegistry {
  return {
    getSpriteInfo: () => spriteInfo ? { ...spriteInfo, layers: [] } : null,
    getTile: () => null,
    getEntity: () => null,
    getAllTiles: () => [],
    getAllEntities: () => [],
    getEntitiesByCategory: () => [],
    getCategories: () => [],
    tileCount: 0,
    entityCount: 0,
    getDecal: () => null,
    getAllDecals: () => [],
    decalCount: 0,
  };
}

describe('getAvailableStates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns state names from RSI meta', async () => {
    const registry = makeRegistry({ rsiPath: 'Structures/Storage/closet.rsi', baseState: 'generic' });
    const meta: RsiMeta = {
      size: { x: 32, y: 32 },
      states: new Map([
        ['generic', { name: 'generic', directions: 1, frameCount: 1, yOffset: 0 }],
        ['generic_open', { name: 'generic_open', directions: 1, frameCount: 1, yOffset: 32 }],
        ['generic_door', { name: 'generic_door', directions: 1, frameCount: 1, yOffset: 64 }],
      ]),
    };
    mockLoadRsiMeta.mockResolvedValue(meta);

    const states = await getAvailableStates('ClosetBase', registry);
    expect(states).toEqual(['generic', 'generic_open', 'generic_door']);
    expect(mockLoadRsiMeta).toHaveBeenCalledWith('Structures/Storage/closet.rsi');
  });

  it('returns empty array when entity has no sprite info', async () => {
    const registry = makeRegistry(null);
    const states = await getAvailableStates('SomeEntity', registry);
    expect(states).toEqual([]);
    expect(mockLoadRsiMeta).not.toHaveBeenCalled();
  });

  it('returns empty array when loadRsiMeta fails', async () => {
    const registry = makeRegistry({ rsiPath: 'Bad/path.rsi', baseState: 'base' });
    mockLoadRsiMeta.mockRejectedValue(new Error('not found'));
    const states = await getAvailableStates('BadEntity', registry);
    expect(states).toEqual([]);
  });
});
