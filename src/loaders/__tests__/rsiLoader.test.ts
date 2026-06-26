import { describe, it, expect } from 'vitest';
import { parseRsiMeta, getDirectionOffset } from '../rsiLoader';

const SAMPLE_META = {
  version: 1,
  size: { x: 32, y: 32 },
  license: 'CC-BY-SA-3.0',
  copyright: 'test',
  states: [
    { name: 'base', directions: 4 },
    { name: 'icon' },
    { name: 'animated', directions: 4, delays: [[0.1, 0.2], [0.1, 0.2], [0.1, 0.2], [0.1, 0.2]] },
  ],
};

describe('parseRsiMeta', () => {
  it('parses state names and directions', () => {
    const result = parseRsiMeta(SAMPLE_META);
    expect(result.size).toEqual({ x: 32, y: 32 });
    expect(result.states.get('base')).toBeDefined();
    expect(result.states.get('base')!.directions).toBe(4);
    expect(result.states.get('icon')!.directions).toBe(1);
  });

  it('calculates frame counts for animated states', () => {
    const result = parseRsiMeta(SAMPLE_META);
    const animated = result.states.get('animated')!;
    expect(animated.directions).toBe(4);
    expect(animated.frameCount).toBe(2);
  });

  it('calculates Y offset for each state (states stack vertically)', () => {
    const result = parseRsiMeta(SAMPLE_META);
    // base: 4 directions = 4 rows -> yOffset = 0
    expect(result.states.get('base')!.yOffset).toBe(0);
    // icon: 1 direction = 1 row -> yOffset = 4
    expect(result.states.get('icon')!.yOffset).toBe(4);
    // animated: 4 directions = 4 rows -> yOffset = 5
    expect(result.states.get('animated')!.yOffset).toBe(5);
  });
});

describe('getDirectionOffset', () => {
  // SS14 RSI direction order: South=0, North=1, East=2, West=3
  it('maps cardinal directions to RSI row offsets', () => {
    expect(getDirectionOffset('south', 4)).toBe(0);
    expect(getDirectionOffset('north', 4)).toBe(1);
    expect(getDirectionOffset('east', 4)).toBe(2);
    expect(getDirectionOffset('west', 4)).toBe(3);
  });

  it('returns 0 for single-direction sprites', () => {
    expect(getDirectionOffset('north', 1)).toBe(0);
    expect(getDirectionOffset('east', 1)).toBe(0);
  });
});
