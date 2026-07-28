/**
 * Setup for the `dom` vitest project (component tests, `*.test.tsx`).
 *
 * Only this project loads it; the `node` project never sees testing-library, so logic tests
 * stay free of DOM machinery.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount anything left rendered between tests. React Testing Library registers this itself
// when it detects a global afterEach, but doing it explicitly means the harness does not
// silently stop cleaning up if `globals` is ever turned off.
afterEach(() => {
  cleanup();
});

/**
 * jsdom has no canvas implementation, so `getContext` returns null and logs a "Not
 * implemented" warning. GRIMP is canvas-heavy, so almost any component test that mounts
 * something near the editor surface trips it.
 *
 * This stub is a RECORDER, not a rasterizer: every 2D method is a no-op spy-able function
 * and nothing is actually drawn. That is enough for components that just need a context to
 * exist without throwing. It is NOT enough to assert on rendered output, so a test that
 * needs real pixels wants the `canvas` npm package (a native dependency) or a
 * render-to-data-URL comparison instead. Asserting "it drew something" against this stub
 * proves only that a method was called.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  const noop = () => {};
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    return {
      canvas: this,
      save: noop,
      restore: noop,
      scale: noop,
      rotate: noop,
      translate: noop,
      transform: noop,
      setTransform: noop,
      resetTransform: noop,
      clearRect: noop,
      fillRect: noop,
      strokeRect: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      rect: noop,
      fill: noop,
      stroke: noop,
      clip: noop,
      drawImage: noop,
      fillText: noop,
      strokeText: noop,
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      putImageData: noop,
      createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      setLineDash: noop,
      getLineDash: () => [],
    } as unknown as CanvasRenderingContext2D;
    // Double cast: getContext is an overloaded signature covering webgl and bitmaprenderer
    // too, and this stub only satisfies the 2d one.
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// jsdom does not implement matchMedia, and components that check a media query throw without
// it. Defaults to "no match", which is the desktop/light case the editor already assumes.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
