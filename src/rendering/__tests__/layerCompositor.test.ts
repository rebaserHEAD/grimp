import { describe, it, expect, beforeEach } from 'vitest';
import { LayerCompositor } from '../layerCompositor';

/** Minimal mock canvas for Node test environment (no DOM). */
function createMockCanvasFactory() {
  return () => ({ width: 0, height: 0, getContext: () => null }) as unknown as HTMLCanvasElement;
}

describe('LayerCompositor', () => {
  let compositor: LayerCompositor;

  beforeEach(() => {
    compositor = new LayerCompositor(0.5, createMockCanvasFactory());
  });

  it('creates with default margin', () => {
    expect(compositor).toBeDefined();
    expect(compositor.margin).toBe(0.5);
  });

  it('resize allocates canvases at oversized dimensions', () => {
    compositor.resize(800, 600, 1);
    expect(compositor.bufferWidth).toBe(1600);
    expect(compositor.bufferHeight).toBe(1200);
  });

  it('resize with DPR scales buffer dimensions', () => {
    compositor.resize(800, 600, 2);
    expect(compositor.bufferWidth).toBe(1600);
    expect(compositor.bufferHeight).toBe(1200);
    expect(compositor.physicalWidth).toBe(3200);
    expect(compositor.physicalHeight).toBe(2400);
  });

  it('all layers start dirty', () => {
    compositor.resize(800, 600, 1);
    expect(compositor.isTilesDirty).toBe(true);
    expect(compositor.isEntitiesDirty).toBe(true);
    expect(compositor.isConnectionsDirty).toBe(true);
  });

  it('invalidateTiles only dirties tile layer', () => {
    compositor.resize(800, 600, 1);
    compositor.markAllClean();
    compositor.invalidateTiles();
    expect(compositor.isTilesDirty).toBe(true);
    expect(compositor.isEntitiesDirty).toBe(false);
  });

  it('invalidateEntities only dirties entity layer', () => {
    compositor.resize(800, 600, 1);
    compositor.markAllClean();
    compositor.invalidateEntities();
    expect(compositor.isEntitiesDirty).toBe(true);
    expect(compositor.isTilesDirty).toBe(false);
  });

  it('invalidateConnections only dirties connection layer', () => {
    compositor.resize(800, 600, 1);
    compositor.markAllClean();
    compositor.invalidateConnections();
    expect(compositor.isConnectionsDirty).toBe(true);
    expect(compositor.isTilesDirty).toBe(false);
    expect(compositor.isEntitiesDirty).toBe(false);
  });

  it('invalidateAll dirties all layers', () => {
    compositor.resize(800, 600, 1);
    compositor.markAllClean();
    compositor.invalidateAll();
    expect(compositor.isTilesDirty).toBe(true);
    expect(compositor.isEntitiesDirty).toBe(true);
    expect(compositor.isConnectionsDirty).toBe(true);
  });

  it('needsLayerRender returns false when all clean', () => {
    compositor.resize(800, 600, 1);
    compositor.markAllClean();
    expect(compositor.needsLayerRender()).toBe(false);
  });

  it('needsLayerRender returns true when any layer dirty', () => {
    compositor.resize(800, 600, 1);
    compositor.markAllClean();
    compositor.invalidateConnections();
    expect(compositor.needsLayerRender()).toBe(true);
  });

  it('panExceedsMargin returns false for small pan', () => {
    compositor.resize(800, 600, 1);
    compositor.setCameraSnapshot(0, 0, 1);
    expect(compositor.panExceedsMargin(100, 50, 800, 600)).toBe(false);
  });

  it('panExceedsMargin returns true when pan exceeds buffer margin', () => {
    compositor.resize(800, 600, 1);
    compositor.setCameraSnapshot(0, 0, 1);
    expect(compositor.panExceedsMargin(500, 0, 800, 600)).toBe(true);
  });

  it('panExceedsMargin returns true for Y overflow', () => {
    compositor.resize(800, 600, 1);
    compositor.setCameraSnapshot(0, 0, 1);
    expect(compositor.panExceedsMargin(0, 350, 800, 600)).toBe(true);
  });

  it('panExceedsMargin returns false at exact boundary', () => {
    compositor.resize(800, 600, 1);
    compositor.setCameraSnapshot(0, 0, 1);
    // margin = 0.5, so marginPxX = 400, marginPxY = 300
    expect(compositor.panExceedsMargin(400, 300, 800, 600)).toBe(false);
  });

  it('zoomChanged detects zoom difference', () => {
    compositor.resize(800, 600, 1);
    compositor.setCameraSnapshot(0, 0, 1);
    expect(compositor.zoomChanged(1)).toBe(false);
    expect(compositor.zoomChanged(1.5)).toBe(true);
  });

  it('setCameraSnapshot stores values accessible via getters', () => {
    compositor.setCameraSnapshot(10, 20, 2.5);
    expect(compositor.snapshotX).toBe(10);
    expect(compositor.snapshotY).toBe(20);
    expect(compositor.snapshotZoom).toBe(2.5);
  });

  it('resize with non-integer viewport rounds up buffer', () => {
    compositor.resize(801, 601, 1);
    // 801 * 2 = 1602, 601 * 2 = 1202
    expect(compositor.bufferWidth).toBe(1602);
    expect(compositor.bufferHeight).toBe(1202);
  });

  it('custom margin affects buffer size', () => {
    const custom = new LayerCompositor(1.0, createMockCanvasFactory());
    custom.resize(800, 600, 1);
    // bufferW = ceil(800 * (1 + 2*1.0)) = ceil(800 * 3) = 2400
    expect(custom.bufferWidth).toBe(2400);
    expect(custom.bufferHeight).toBe(1800);
  });

  it('canvas accessors return non-null after resize', () => {
    compositor.resize(800, 600, 1);
    expect(compositor.getTileCanvas()).not.toBeNull();
    expect(compositor.getEntityCanvas()).not.toBeNull();
    expect(compositor.getConnectionCanvas()).not.toBeNull();
  });
});

describe('LayerCompositor compositing', () => {
  it('small pan does not exceed margin', () => {
    const c = new LayerCompositor(0.5, createMockCanvasFactory());
    c.resize(800, 600, 1);
    c.setCameraSnapshot(10, 10, 1);
    // 100px pan on 800px viewport, margin = 400px → no exceed
    expect(c.panExceedsMargin(100, 0, 800, 600)).toBe(false);
  });

  it('large pan exceeds margin', () => {
    const c = new LayerCompositor(0.5, createMockCanvasFactory());
    c.resize(800, 600, 1);
    c.setCameraSnapshot(10, 10, 1);
    // 450px pan on 800px viewport, margin = 400px → exceed
    expect(c.panExceedsMargin(450, 0, 800, 600)).toBe(true);
  });

  it('invalidateAll dirties all layers', () => {
    const c = new LayerCompositor(0.5, createMockCanvasFactory());
    c.resize(800, 600, 1);
    c.markAllClean();
    c.invalidateAll();
    expect(c.isTilesDirty).toBe(true);
    expect(c.isEntitiesDirty).toBe(true);
    expect(c.isConnectionsDirty).toBe(true);
  });

  it('resize re-dirties all layers', () => {
    const c = new LayerCompositor(0.5, createMockCanvasFactory());
    c.resize(800, 600, 1);
    c.markAllClean();
    c.resize(1024, 768, 1);
    expect(c.isTilesDirty).toBe(true);
    expect(c.isEntitiesDirty).toBe(true);
  });

  it('different margins produce different buffer sizes', () => {
    const small = new LayerCompositor(0.3, createMockCanvasFactory());
    small.resize(800, 600, 1);
    const large = new LayerCompositor(0.75, createMockCanvasFactory());
    large.resize(800, 600, 1);
    expect(large.bufferWidth).toBeGreaterThan(small.bufferWidth);
  });

  it('margin 0 produces exact viewport size', () => {
    const c = new LayerCompositor(0, createMockCanvasFactory());
    c.resize(800, 600, 1);
    expect(c.bufferWidth).toBe(800);
    expect(c.bufferHeight).toBe(600);
  });
});

describe('light layer', () => {
  const fakeCanvasFactory = createMockCanvasFactory();

  it('creates light canvas on resize', () => {
    const c = new LayerCompositor(0.5, fakeCanvasFactory);
    c.resize(800, 600, 1);
    expect(c.getLightCanvas()).not.toBeNull();
    // getLightCtx returns null in test because mock getContext returns null
    // In production this returns a real CanvasRenderingContext2D
  });

  it('tracks light layer dirty state', () => {
    const c = new LayerCompositor(0.5, fakeCanvasFactory);
    c.resize(800, 600, 1);
    expect(c.isLightDirty).toBe(true); // dirty after resize
    c.markAllClean();
    expect(c.isLightDirty).toBe(false);
    c.invalidateLight();
    expect(c.isLightDirty).toBe(true);
  });

  it('invalidateAll includes light layer', () => {
    const c = new LayerCompositor(0.5, fakeCanvasFactory);
    c.resize(800, 600, 1);
    c.markAllClean();
    c.invalidateAll();
    expect(c.isLightDirty).toBe(true);
  });

  it('invalidateEntities also invalidates light', () => {
    const c = new LayerCompositor(0.5, fakeCanvasFactory);
    c.resize(800, 600, 1);
    c.markAllClean();
    c.invalidateEntities();
    expect(c.isLightDirty).toBe(true);
  });

  it('needsLayerRender includes light dirty', () => {
    const c = new LayerCompositor(0.5, fakeCanvasFactory);
    c.resize(800, 600, 1);
    c.markAllClean();
    expect(c.needsLayerRender()).toBe(false);
    c.invalidateLight();
    expect(c.needsLayerRender()).toBe(true);
  });
});
