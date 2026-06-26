import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STAR_TINTS, STAR_DEPTH_LAYERS, getSpaceBgCache, resetSpaceBg } from '../gridRenderer';

// Stub Image for node environment
vi.stubGlobal('Image', class {
  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) { /* no-op */ }
});

describe('space background', () => {
  beforeEach(() => {
    resetSpaceBg();
  });

  describe('STAR_TINTS configuration', () => {
    it('has exactly 3 tints', () => {
      expect(STAR_TINTS).toHaveLength(3);
    });

    it('each tint has r, g, b in 0-255 range', () => {
      for (const tint of STAR_TINTS) {
        expect(tint.r).toBeGreaterThanOrEqual(0);
        expect(tint.r).toBeLessThanOrEqual(255);
        expect(tint.g).toBeGreaterThanOrEqual(0);
        expect(tint.g).toBeLessThanOrEqual(255);
        expect(tint.b).toBeGreaterThanOrEqual(0);
        expect(tint.b).toBeLessThanOrEqual(255);
      }
    });

    it('tints are visually distinct (channel distance > 100)', () => {
      for (let i = 0; i < STAR_TINTS.length; i++) {
        for (let j = i + 1; j < STAR_TINTS.length; j++) {
          const a = STAR_TINTS[i];
          const b = STAR_TINTS[j];
          const diff = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
          expect(diff).toBeGreaterThan(100);
        }
      }
    });
  });

  describe('STAR_DEPTH_LAYERS configuration', () => {
    it('has 3 depth layers', () => {
      expect(STAR_DEPTH_LAYERS).toHaveLength(3);
    });

    it('parallax increases with depth (closer = more movement)', () => {
      for (let i = 1; i < STAR_DEPTH_LAYERS.length; i++) {
        expect(STAR_DEPTH_LAYERS[i].parallax).toBeGreaterThan(STAR_DEPTH_LAYERS[i - 1].parallax);
      }
    });

    it('blur decreases with depth (closer = sharper)', () => {
      for (let i = 1; i < STAR_DEPTH_LAYERS.length; i++) {
        expect(STAR_DEPTH_LAYERS[i].blur).toBeLessThan(STAR_DEPTH_LAYERS[i - 1].blur);
      }
    });

    it('opacity increases with depth (closer = brighter)', () => {
      for (let i = 1; i < STAR_DEPTH_LAYERS.length; i++) {
        expect(STAR_DEPTH_LAYERS[i].opacity).toBeGreaterThan(STAR_DEPTH_LAYERS[i - 1].opacity);
      }
    });

    it('each layer references a valid tint index', () => {
      for (const layer of STAR_DEPTH_LAYERS) {
        expect(layer.tint).toBeGreaterThanOrEqual(0);
        expect(layer.tint).toBeLessThan(STAR_TINTS.length);
      }
    });
  });

  describe('getSpaceBgCache', () => {
    it('returns null before images load', () => {
      const cache = getSpaceBgCache(800, 600);
      expect(cache).toBeNull();
    });

    it('returns null after reset', () => {
      getSpaceBgCache(800, 600);
      resetSpaceBg();
      expect(getSpaceBgCache(800, 600)).toBeNull();
    });
  });
});
