import { describe, it, expect, beforeEach } from 'vitest';
import { EntitySelectTool, _getOutlineCacheSize, _clearOutlineCache } from '../entitySelectTool';
import type { ToolContext } from '../toolTypes';
import type { ImportedEntity } from '../../import/mapImporter';
import { createInitialState } from '../../state/editorState';
import { rebuildSpatialIndex } from '../../rendering/spatialIndex';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

function makeMockRegistry(): IPrototypeRegistry {
  return {
    getTile: () => null,
    getEntity: (id) => ({
      id, name: id, description: '', suffix: '', abstract: false,
      categories: [], placement: {}, components: [], spriteInfo: null,
      sourceCategory: 'Other', raw: { type: 'entity' as const, id },
    }),
    getAllTiles: () => [],
    getAllEntities: () => [],
    getEntitiesByCategory: () => [],
    getCategories: () => [],
    getSpriteInfo: () => null,
    tileCount: 0,
    entityCount: 0,
    getDecal: () => null,
    getAllDecals: () => [],
    decalCount: 0,
  };
}

function makeMockCanvasCtx(): CanvasRenderingContext2D {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === '_calls') return calls;
      if (typeof prop === 'string') {
        return (...args: unknown[]) => { calls.push(prop); };
      }
    },
    set() { return true; },
  };
  return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D;
}

describe('outline cache LRU', () => {
  beforeEach(() => {
    _clearOutlineCache();
  });

  it('starts empty after clear', () => {
    expect(_getOutlineCacheSize()).toBe(0);
  });

  it('clear resets size to zero', () => {
    _clearOutlineCache();
    expect(_getOutlineCacheSize()).toBe(0);
  });
});

describe('selection highlight rendering', () => {
  it('frustum culling skips off-screen entities (no canvas calls for them)', () => {
    const tool = new EntitySelectTool();
    // Place entity far off-screen (x=1000 in world coords)
    const farEntity = makeEntity(1, 'APC', 1000, 1000);
    const entities = [farEntity];
    rebuildSpatialIndex(entities);

    const state = {
      ...createInitialState(),
      entities,
      selectedEntityUids: [1],
      registry: makeMockRegistry(),
    };

    const mockCtx = makeMockCanvasCtx();
    const camera = {
      tileScreenSize: 32,
      worldToScreenX: (wx: number, _cw: number) => (wx - 0) * 32,
      worldToScreenY: (wy: number, _ch: number) => (0 - wy) * 32,
      zoom: 1,
    };

    const toolCtx: ToolContext = {
      state,
      dispatch: () => { },
      camera: camera as any,
      canvasW: 800,
      canvasH: 600,
      paletteItem: null,
      shiftHeld: false,
      ctrlHeld: false,
    };

    tool.renderPreview(mockCtx, toolCtx, 0, 0);

    // Entity at (1000, 1000) with 32px tiles → screen position ~32000px
    // Should be culled, no strokeRect calls for it
    const calls = (mockCtx as any)._calls as string[];
    const strokeRectCalls = calls.filter((c: string) => c === 'strokeRect');
    expect(strokeRectCalls.length).toBe(0);
  });

  it('renders visible selected entities', () => {
    const tool = new EntitySelectTool();
    // Place entity at origin, should be visible
    const entity = makeEntity(1, 'APC', 2, 2);
    const entities = [entity];
    rebuildSpatialIndex(entities);

    const state = {
      ...createInitialState(),
      entities,
      selectedEntityUids: [1],
      registry: null, // no registry = fallback to simple rect
    };

    const mockCtx = makeMockCanvasCtx();
    const camera = {
      tileScreenSize: 32,
      worldToScreenX: (wx: number, _cw: number) => wx * 32 + 400,
      worldToScreenY: (wy: number, _ch: number) => -wy * 32 + 300,
      zoom: 1,
    };

    const toolCtx: ToolContext = {
      state,
      dispatch: () => { },
      camera: camera as any,
      canvasW: 800,
      canvasH: 600,
      paletteItem: null,
      shiftHeld: false,
      ctrlHeld: false,
    };

    tool.renderPreview(mockCtx, toolCtx, 0, 0);

    const calls = (mockCtx as any)._calls as string[];
    const strokeRectCalls = calls.filter((c: string) => c === 'strokeRect');
    expect(strokeRectCalls.length).toBeGreaterThan(0);
  });

  it('uses LOD rects when selection exceeds threshold (>100 entities)', () => {
    const tool = new EntitySelectTool();
    // Create 150 entities (above LOD_RECT_THRESHOLD of 100)
    const entities: ImportedEntity[] = [];
    const uids: number[] = [];
    for (let i = 0; i < 150; i++) {
      entities.push(makeEntity(i + 1, 'APC', i % 10, Math.floor(i / 10)));
      uids.push(i + 1);
    }
    rebuildSpatialIndex(entities);

    const state = {
      ...createInitialState(),
      entities,
      selectedEntityUids: uids,
      registry: makeMockRegistry(),
    };

    const mockCtx = makeMockCanvasCtx();
    const camera = {
      tileScreenSize: 32,
      // Place entities near center so they're visible
      worldToScreenX: (wx: number, _cw: number) => wx * 32 + 100,
      worldToScreenY: (wy: number, _ch: number) => -wy * 32 + 500,
      zoom: 1,
    };

    const toolCtx: ToolContext = {
      state,
      dispatch: () => { },
      camera: camera as any,
      canvasW: 800,
      canvasH: 600,
      paletteItem: null,
      shiftHeld: false,
      ctrlHeld: false,
    };

    tool.renderPreview(mockCtx, toolCtx, 0, 0);

    // LOD mode uses strokeRect (no save/restore for rotation, no drawImage for outlines)
    const calls = (mockCtx as any)._calls as string[];
    const strokeRectCalls = calls.filter((c: string) => c === 'strokeRect');
    // Should have drawn rects for visible entities (those within 800x600 viewport)
    expect(strokeRectCalls.length).toBeGreaterThan(0);
    // No save/restore calls, LOD mode skips per-entity canvas state changes
    const saveCalls = calls.filter((c: string) => c === 'save');
    expect(saveCalls.length).toBe(0);
  });
});
