import { describe, it, expect, beforeEach } from 'vitest';
import {
  isMarkerPrototype,
  isLayerVisible,
  clearPrototypeFlags,
  DEFAULT_LAYER_VISIBILITY,
} from '../entityRenderer';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';

/**
 * The Markers layer mirrors the game's `showmarkers` gate: entities carrying
 * the Marker component hide with the layer. Name heuristics alone miss
 * prototypes like WarpPoint, so the registry's composed component list is
 * the authority when available.
 */

function fakeRegistry(componentsByProto: Record<string, string[]>): IPrototypeRegistry {
  return {
    getEntity: (id: string) =>
      componentsByProto[id]
        ? { id, components: componentsByProto[id].map(type => ({ type })) }
        : undefined,
  } as unknown as IPrototypeRegistry;
}

beforeEach(() => clearPrototypeFlags());

describe('isMarkerPrototype', () => {
  it('name heuristic still catches conventional marker names', () => {
    expect(isMarkerPrototype('AtmosFixBlockerMarker')).toBe(true);
    expect(isMarkerPrototype('SpawnPointLatejoin')).toBe(true);
  });

  it('registry component check catches markers the name heuristic misses', () => {
    const registry = fakeRegistry({ WarpPoint: ['Transform', 'Marker', 'Sprite'] });
    expect(isMarkerPrototype('WarpPoint', registry)).toBe(true);
  });

  it('non-markers stay non-markers', () => {
    const registry = fakeRegistry({ WallSolid: ['Transform', 'Sprite', 'Occluder'] });
    expect(isMarkerPrototype('WallSolid', registry)).toBe(false);
  });

  it('unknown prototypes without registry fall back to the name heuristic only', () => {
    expect(isMarkerPrototype('WarpPoint')).toBe(false);
  });
});

describe('isLayerVisible with the markers layer off', () => {
  const layers = { ...DEFAULT_LAYER_VISIBILITY, markers: false };

  it('hides component-detected markers at object depth', () => {
    const registry = fakeRegistry({ WarpPoint: ['Marker'] });
    expect(isLayerVisible(0, 'WarpPoint', layers, registry)).toBe(false);
  });

  it('keeps ordinary objects visible', () => {
    const registry = fakeRegistry({ Table: ['Sprite'] });
    expect(isLayerVisible(0, 'Table', layers, registry)).toBe(true);
  });
});
