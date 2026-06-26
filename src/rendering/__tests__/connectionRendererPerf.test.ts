import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ImportedEntity } from '../../import/mapImporter';

// Mock spatialIndex before importing connectionRenderer
vi.mock('../spatialIndex', () => {
  const entityMap = new Map<number, ImportedEntity>();
  return {
    spatialGetInRect: (_minX: number, _minY: number, _maxX: number, _maxY: number) => {
      return Array.from(entityMap.values());
    },
    spatialGetByUid: (uid: number) => entityMap.get(uid) ?? undefined,
    __setEntities: (entities: ImportedEntity[]) => {
      entityMap.clear();
      for (const e of entities) entityMap.set(e.uid, e);
    },
  };
});

import { renderConnections } from '../connectionRenderer';
import { Camera } from '../camera';

// Access the mock helper
const { __setEntities } = await import('../spatialIndex') as unknown as {
  __setEntities: (entities: ImportedEntity[]) => void;
};

function makeEntity(uid: number, x: number, y: number, components: Record<string, unknown>[] = []): ImportedEntity {
  return {
    uid,
    prototype: `TestEntity${uid}`,
    position: { x, y },
    rotation: 0,
    components,
  };
}

function makeCtx(): CanvasRenderingContext2D {
  const paths: string[] = [];
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(() => paths.push('beginPath')),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(() => paths.push('stroke')),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    textAlign: 'center' as CanvasTextAlign,
    textBaseline: 'middle' as CanvasTextBaseline,
    font: '',
    __paths: paths,
  } as unknown as CanvasRenderingContext2D;
}

function makeCamera(zoom: number = 1): Camera {
  const cam = new Camera();
  cam.zoom = zoom;
  return cam;
}

describe('connectionRenderer', () => {
  beforeEach(() => {
    __setEntities([]);
  });

  it('exports renderConnections function', () => {
    expect(typeof renderConnections).toBe('function');
  });

  it('skips rendering when zoomed out below threshold', () => {
    const ctx = makeCtx();
    const cam = makeCamera(0.1); // tileScreenSize = 3.2 < 4
    const source = makeEntity(1, 0, 0, [{ type: 'DeviceList', devices: [2] }]);
    const target = makeEntity(2, 1, 0);
    __setEntities([source, target]);

    renderConnections(ctx, [source, target], cam, 800, 600);

    expect(ctx.beginPath).not.toHaveBeenCalled();
  });

  it('renders DeviceList connections as lines', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1);
    const source = makeEntity(1, 5, 5, [{ type: 'DeviceList', devices: [2, 3] }]);
    const target1 = makeEntity(2, 6, 5);
    const target2 = makeEntity(3, 5, 6);
    const entities = [source, target1, target2];
    __setEntities(entities);

    renderConnections(ctx, entities, cam, 800, 600);

    // Should have drawn lines (beginPath + moveTo/lineTo + stroke)
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('renders DeviceLinkSource connections as lines', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1);
    const source = makeEntity(1, 5, 5, [{
      type: 'DeviceLinkSource',
      linkedPorts: { '2': [['Pressed', 'Toggle']] },
    }]);
    const target = makeEntity(2, 7, 5);
    const entities = [source, target];
    __setEntities(entities);

    renderConnections(ctx, entities, cam, 800, 600);

    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('skips connections to deleted (missing) entities', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1);
    // Source links to UID 99 which doesn't exist
    const source = makeEntity(1, 5, 5, [{ type: 'DeviceList', devices: [99] }]);
    __setEntities([source]);

    renderConnections(ctx, [source], cam, 800, 600);

    // moveTo/lineTo should NOT be called since target doesn't exist
    expect(ctx.moveTo).not.toHaveBeenCalled();
    expect(ctx.lineTo).not.toHaveBeenCalled();
  });

  it('uses batched rendering (single beginPath/stroke per connection style)', () => {
    const ctx = makeCtx();
    const cam = makeCamera(0.4); // tileScreenSize = 12.8, above 4 (renders) but below 16 (no badges)
    // 3 sources each with DeviceList connections
    const entities: ImportedEntity[] = [];
    for (let i = 0; i < 3; i++) {
      entities.push(makeEntity(i * 10, 5 + i, 5, [{ type: 'DeviceList', devices: [i * 10 + 1] }]));
      entities.push(makeEntity(i * 10 + 1, 5 + i, 6));
    }
    __setEntities(entities);

    renderConnections(ctx, entities, cam, 800, 600);

    // With batching: 1 beginPath + 1 stroke for all DeviceList unselected lines
    // Without batching it would be 3 beginPath + 3 stroke calls
    const paths = (ctx as unknown as { __paths: string[] }).__paths;
    const strokeCount = paths.filter(p => p === 'stroke').length;
    // Exactly 1 stroke batch for DeviceList unselected (no selected, no DeviceLinkSource, no badges)
    expect(strokeCount).toBe(1);
  });

  it('draws arrows for selected entity connections', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1);
    const source = makeEntity(1, 5, 5, [{ type: 'DeviceList', devices: [2] }]);
    const target = makeEntity(2, 6, 5);
    const entities = [source, target];
    __setEntities(entities);

    // Select the source entity
    renderConnections(ctx, entities, cam, 800, 600, [1]);

    // Should have multiple beginPath/stroke calls:
    // 1 for dim unselected (empty), 1 for selected lines, 1 for arrows
    // At minimum the selected batch + arrows batch
    const paths = (ctx as unknown as { __paths: string[] }).__paths;
    const strokeCount = paths.filter(p => p === 'stroke').length;
    expect(strokeCount).toBeGreaterThanOrEqual(2); // selected lines + arrows
  });

  it('dims unselected connections when selection is active', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1);
    const entity1 = makeEntity(1, 5, 5, [{ type: 'DeviceList', devices: [2] }]);
    const entity2 = makeEntity(2, 6, 5);
    const entity3 = makeEntity(3, 8, 5, [{ type: 'DeviceList', devices: [4] }]);
    const entity4 = makeEntity(4, 9, 5);
    const entities = [entity1, entity2, entity3, entity4];
    __setEntities(entities);

    // Select only entity3, entity1's connections should be dimmed
    renderConnections(ctx, entities, cam, 800, 600, [3]);

    // globalAlpha should have been set to 0.15 (dimmed) at some point
    const alphaValues: number[] = [];
    Object.defineProperty(ctx, 'globalAlpha', {
      set(v: number) { alphaValues.push(v); },
      get() { return alphaValues[alphaValues.length - 1] ?? 1; },
    });

    // Re-render to capture alpha values
    renderConnections(ctx, entities, cam, 800, 600, [3]);
    expect(alphaValues).toContain(0.15); // dimmed unselected
    expect(alphaValues).toContain(1.0);  // bright selected
  });

  it('draws badges when zoomed in enough', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1); // tileScreenSize = 32 >= 16
    const source = makeEntity(1, 5, 5, [{ type: 'DeviceList', devices: [2, 3] }]);
    const target1 = makeEntity(2, 6, 5);
    const target2 = makeEntity(3, 5, 6);
    const entities = [source, target1, target2];
    __setEntities(entities);

    renderConnections(ctx, entities, cam, 800, 600);

    // Should draw badge circle + text
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('2', expect.any(Number), expect.any(Number));
  });

  it('skips badges when zoomed out', () => {
    const ctx = makeCtx();
    const cam = makeCamera(0.4); // tileScreenSize = 12.8 < 16
    const source = makeEntity(1, 5, 5, [{ type: 'DeviceList', devices: [2] }]);
    const target = makeEntity(2, 6, 5);
    const entities = [source, target];
    __setEntities(entities);

    renderConnections(ctx, entities, cam, 800, 600);

    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('handles entities with no connection components', () => {
    const ctx = makeCtx();
    const cam = makeCamera(1);
    const entity = makeEntity(1, 5, 5, [{ type: 'MetaData', name: 'test' }]);
    __setEntities([entity]);

    renderConnections(ctx, [entity], cam, 800, 600);

    // No lines drawn
    expect(ctx.moveTo).not.toHaveBeenCalled();
  });
});
