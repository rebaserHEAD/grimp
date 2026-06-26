import { describe, it, expect } from 'vitest';
import {
  normalizeRotation,
  buildTransformComponent,
  updateTransformRot,
  cloneComponentsWithPos,
  cloneComponentsWithPosRot,
} from '../entityHelpers';

describe('normalizeRotation', () => {
  it('normalizes negative values', () => {
    expect(normalizeRotation(-Math.PI / 2)).toBeCloseTo(3 * Math.PI / 2);
  });

  it('normalizes values > 2π', () => {
    expect(normalizeRotation(5 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  it('snaps to 90° increments within floating-point tolerance', () => {
    expect(normalizeRotation(Math.PI / 2 + 1e-12)).toBeCloseTo(Math.PI / 2);
  });

  it('zero stays zero', () => {
    expect(normalizeRotation(0)).toBe(0);
  });

  it('full rotation wraps to zero', () => {
    expect(normalizeRotation(2 * Math.PI)).toBe(0);
  });
});

describe('buildTransformComponent', () => {
  it('rotation 0 omits rot field', () => {
    const components = buildTransformComponent({ x: 1.5, y: 2.5 }, 0, 1);
    expect(components).toHaveLength(1);
    const transform = components[0];
    expect(transform.type).toBe('Transform');
    expect(transform.pos).toBe('1.5,2.5');
    expect(transform.parent).toBe(1);
    expect(transform).not.toHaveProperty('rot');
  });

  it('non-zero rotation writes rot as string with rad suffix', () => {
    const rotation = Math.PI / 2;
    const components = buildTransformComponent({ x: 3.5, y: 4.5 }, rotation, 1);
    const transform = components[0];
    expect(transform.rot).toBe(`${rotation} rad`);
    expect(typeof transform.rot).toBe('string');
  });
});

describe('updateTransformRot', () => {
  it('updates existing Transform rot to string with rad suffix', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1, rot: '0 rad' },
      { type: 'Battery', startingCharge: 25000 },
    ];
    const newRot = 3 * Math.PI / 2;
    const updated = updateTransformRot(components, newRot);
    const transform = updated.find(c => c.type === 'Transform')!;
    expect(transform.rot).toBe(`${newRot} rad`);
    expect(typeof transform.rot).toBe('string');
  });

  it('rotation 0 deletes the rot field', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1, rot: '1.5707963267948966 rad' },
    ];
    const updated = updateTransformRot(components, 0);
    const transform = updated.find(c => c.type === 'Transform')!;
    expect(transform).not.toHaveProperty('rot');
  });

  it('does not modify non-Transform components', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1 },
      { type: 'Battery', startingCharge: 25000 },
    ];
    const updated = updateTransformRot(components, Math.PI);
    const battery = updated.find(c => c.type === 'Battery')!;
    expect(battery.startingCharge).toBe(25000);
  });
});

describe('cloneComponentsWithPos', () => {
  it('updates Transform pos and clones all components', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1, rot: '1.5707963267948966 rad' },
      { type: 'Battery', startingCharge: 25000 },
    ];
    const result = cloneComponentsWithPos(components, { x: 10.5, y: 20.5 });
    const transform = result.find(c => c.type === 'Transform')!;
    expect(transform.pos).toBe('10.5,20.5');
    // Other Transform fields preserved
    expect(transform.rot).toBe('1.5707963267948966 rad');
    expect(transform.parent).toBe(1);
    // Non-Transform components cloned
    const battery = result.find(c => c.type === 'Battery')!;
    expect(battery.startingCharge).toBe(25000);
  });

  it('does not mutate the original components array', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1 },
      { type: 'Physics', bodyType: 'Static' },
    ];
    const originalPos = components[0].pos;
    cloneComponentsWithPos(components, { x: 99.5, y: 99.5 });
    expect(components[0].pos).toBe(originalPos);
  });

  it('returns new object references for all components', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1 },
      { type: 'Battery', startingCharge: 25000 },
    ];
    const result = cloneComponentsWithPos(components, { x: 5.5, y: 5.5 });
    expect(result[0]).not.toBe(components[0]);
    expect(result[1]).not.toBe(components[1]);
  });
});

describe('cloneComponentsWithPosRot', () => {
  it('updates both pos and rot with nonzero rotation', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1 },
      { type: 'Battery', startingCharge: 25000 },
    ];
    const rot = Math.PI / 2;
    const result = cloneComponentsWithPosRot(components, { x: 10.5, y: 20.5 }, rot);
    const transform = result.find(c => c.type === 'Transform')!;
    expect(transform.pos).toBe('10.5,20.5');
    expect(transform.rot).toBe(`${rot} rad`);
  });

  it('deletes rot key when rotation is zero', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1, rot: '1.5707963267948966 rad' },
    ];
    const result = cloneComponentsWithPosRot(components, { x: 5.5, y: 5.5 }, 0);
    const transform = result.find(c => c.type === 'Transform')!;
    expect(transform).not.toHaveProperty('rot');
    expect(transform.pos).toBe('5.5,5.5');
  });

  it('does not mutate the original components array', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1, rot: '0 rad' },
      { type: 'Physics', bodyType: 'Static' },
    ];
    const originalPos = components[0].pos;
    const originalRot = components[0].rot;
    cloneComponentsWithPosRot(components, { x: 99.5, y: 99.5 }, Math.PI);
    expect(components[0].pos).toBe(originalPos);
    expect(components[0].rot).toBe(originalRot);
  });

  it('returns new object references for all components', () => {
    const components: Record<string, unknown>[] = [
      { type: 'Transform', pos: '1.5,2.5', parent: 1 },
      { type: 'Battery', startingCharge: 25000 },
    ];
    const result = cloneComponentsWithPosRot(components, { x: 5.5, y: 5.5 }, Math.PI);
    expect(result[0]).not.toBe(components[0]);
    expect(result[1]).not.toBe(components[1]);
  });
});
