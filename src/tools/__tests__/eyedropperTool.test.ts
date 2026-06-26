import { describe, it, expect, beforeEach } from 'vitest';
import { EyedropperTool } from '../eyedropperTool';
import type { ToolContext } from '../toolTypes';
import type { ImportedEntity } from '../../import/mapImporter';
import type { DecalInstance } from '../../import/decalParser';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';
import type { LayerVisibility } from '../../rendering/entityRenderer';
import { DEFAULT_LAYER_VISIBILITY, clearDrawDepthCache } from '../../rendering/entityRenderer';
import { createInitialState } from '../../state/editorState';
import { rebuildSpatialIndex } from '../../rendering/spatialIndex';

function makeEntity(uid: number, proto: string, x: number, y: number): ImportedEntity {
  return { uid, prototype: proto, position: { x: x + 0.5, y: y + 0.5 }, rotation: 0, components: [] };
}

function makeMockRegistry(): IPrototypeRegistry {
  return {
    getTile: () => null,
    getEntity: (id) => ({
      id, name: id, description: '', suffix: '', abstract: false,
      categories: [], placement: {}, components: [],
      spriteInfo: { rsiPath: 'test.rsi', baseState: 'base', layers: [] },
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

function makeDecal(id: number, proto: string, x: number, y: number, color: string | null = null): DecalInstance {
  return { id, prototypeId: proto, position: { x: x + 0.5, y: y + 0.5 }, color, angle: 0, zIndex: 0, cleanable: false };
}

function makeToolContext(
  entities: ImportedEntity[] = [],
  tileId: string | null = null,
  decals: DecalInstance[] = [],
  layerVisibility?: LayerVisibility,
): { ctx: ToolContext; dispatched: any[]; getDecalColor: () => string | null } {
  rebuildSpatialIndex(entities);
  const dispatched: any[] = [];
  const grid = tileId ? {
    width: 20, height: 20, offsetX: 0, offsetY: 0,
    cells: Array.from({ length: 400 }, () => ({ tileId: tileId! })),
  } : { width: 0, height: 0, offsetX: 0, offsetY: 0, cells: [] };

  const baseState = createInitialState();
  // Put decals into the active grid
  const grids = [...baseState.grids];
  grids[0] = {
    ...grids[0],
    grid,
    entities,
    decals: { decals, nextDecalId: decals.length > 0 ? Math.max(...decals.map(d => d.id)) + 1 : 0 },
  };

  const state = {
    ...baseState,
    entities,
    registry: makeMockRegistry(),
    grid,
    grids,
  };

  let decalColor: string | null = null;
  const ctx: ToolContext = {
    state,
    dispatch: (action: any) => { dispatched.push(action); },
    camera: { tileScreenSize: 32 } as any,
    canvasW: 800,
    canvasH: 600,
    paletteItem: null,
    shiftHeld: false,
    ctrlHeld: false,
    setDecalColor: (color: string | null) => { decalColor = color; },
    layerVisibility,
  };
  return { ctx, dispatched, getDecalColor: () => decalColor };
}

describe('EyedropperTool', () => {
  describe('click picking', () => {
    it('picks topmost entity on click', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel');

      tool.onMouseDown(ctx, 5, 5, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction.item).toEqual({ type: 'entity', id: 'APCBasic' });
      expect(dispatched.find(a => a.type === 'SET_TOOL').tool).toBe('entityPlace');
    });

    it('picks tile when no entity at location', () => {
      const tool = new EyedropperTool();
      const { ctx, dispatched } = makeToolContext([], 'FloorSteel');

      tool.onMouseDown(ctx, 3, 3, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction.item).toEqual({ type: 'tile', id: 'FloorSteel' });
      expect(dispatched.find(a => a.type === 'SET_TOOL').tool).toBe('paint');
    });

    it('does not pick on right click', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel');

      tool.onMouseDown(ctx, 5, 5, 2);
      expect(dispatched).toHaveLength(0);
    });

    it('does not pick Space tiles when no entities present', () => {
      const tool = new EyedropperTool();
      const { ctx, dispatched } = makeToolContext([], 'Space');

      tool.onMouseDown(ctx, 3, 3, 0);
      expect(dispatched).toHaveLength(0);
    });

    it('entity pick takes priority over tile', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'GasVentPump', 5, 5);
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel');

      tool.onMouseDown(ctx, 5, 5, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction.item.type).toBe('entity');
      expect(paletteAction.item.id).toBe('GasVentPump');
      expect(dispatched.find(a => a.type === 'SET_TOOL').tool).toBe('entityPlace');
    });
  });

  describe('scroll picker', () => {
    it('opens picker on scroll when 2+ items at tile (entities + tile)', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx } = makeToolContext([e1], 'FloorSteel');

      const handled = tool.onWheel!(ctx, 5, 5, 1);
      expect(handled).toBe(true);

      const picker = tool.getPickerState();
      expect(picker.open).toBe(true);
      expect(picker.items).toHaveLength(2); // entity + tile
      expect(picker.items[0].type).toBe('entity');
      expect(picker.items[0].id).toBe('APCBasic');
      expect(picker.items[1].type).toBe('tile');
      expect(picker.items[1].id).toBe('FloorSteel');
    });

    it('does not open picker when only 1 item at tile', () => {
      const tool = new EyedropperTool();
      const { ctx } = makeToolContext([], 'FloorSteel');

      const handled = tool.onWheel!(ctx, 3, 3, 1);
      expect(handled).toBe(false);
      expect(tool.getPickerState().open).toBe(false);
    });

    it('cycles picker index on repeated scroll', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const e2 = makeEntity(2, 'WallSolid', 5, 5);
      const { ctx } = makeToolContext([e1, e2], 'FloorSteel');

      tool.onWheel!(ctx, 5, 5, 1); // opens, index → 1
      expect(tool.getPickerState().index).toBe(1);

      tool.onWheel!(ctx, 5, 5, 1); // index → 2
      expect(tool.getPickerState().index).toBe(2);

      tool.onWheel!(ctx, 5, 5, 1); // wraps → 0
      expect(tool.getPickerState().index).toBe(0);
    });

    it('scrolls backward', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const e2 = makeEntity(2, 'WallSolid', 5, 5);
      const { ctx } = makeToolContext([e1, e2], 'FloorSteel');

      tool.onWheel!(ctx, 5, 5, 1); // opens, index → 1
      tool.onWheel!(ctx, 5, 5, -1); // back → 0
      expect(tool.getPickerState().index).toBe(0);

      tool.onWheel!(ctx, 5, 5, -1); // wraps → 2 (last item)
      expect(tool.getPickerState().index).toBe(2);
    });

    it('click picks the currently highlighted item', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel');

      // Scroll to open picker, index starts at 1 (FloorSteel tile)
      tool.onWheel!(ctx, 5, 5, 1);
      expect(tool.getPickerState().items[1].type).toBe('tile');

      // Click to confirm selection
      tool.onMouseDown(ctx, 5, 5, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction.item).toEqual({ type: 'tile', id: 'FloorSteel' });
      expect(dispatched.find(a => a.type === 'SET_TOOL').tool).toBe('paint');
      expect(tool.getPickerState().open).toBe(false);
    });

    it('includes tile in picker items', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx } = makeToolContext([e1], 'Plating');

      tool.onWheel!(ctx, 5, 5, 1);

      const items = tool.getPickerState().items;
      const tileItem = items.find(i => i.type === 'tile');
      expect(tileItem).toBeDefined();
      expect(tileItem!.id).toBe('Plating');
    });

    it('closes picker when cursor moves to different tile', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx } = makeToolContext([e1], 'FloorSteel');

      tool.onWheel!(ctx, 5, 5, 1);
      expect(tool.getPickerState().open).toBe(true);

      tool.onMouseMove(ctx, 6, 6);
      expect(tool.getPickerState().open).toBe(false);
    });

    it('closes picker on deactivate', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const { ctx } = makeToolContext([e1], 'FloorSteel');

      tool.onWheel!(ctx, 5, 5, 1);
      expect(tool.getPickerState().open).toBe(true);

      tool.deactivate!();
      expect(tool.getPickerState().open).toBe(false);
    });

    it('does not include Space tile in picker', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const e2 = makeEntity(2, 'WallSolid', 5, 5);
      const { ctx } = makeToolContext([e1, e2], 'Space');

      tool.onWheel!(ctx, 5, 5, 1);

      const items = tool.getPickerState().items;
      expect(items.every(i => i.type === 'entity')).toBe(true);
      expect(items).toHaveLength(2);
    });
  });

  describe('decal picking', () => {
    it('picks decal on click when no entity present', () => {
      const tool = new EyedropperTool();
      const d1 = makeDecal(1, 'BotGreyscale', 3, 3, '#FF0000FF');
      const { ctx, dispatched } = makeToolContext([], 'FloorSteel', [d1]);

      tool.onMouseDown(ctx, 3, 3, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction).toBeDefined();
      expect(paletteAction.item).toEqual({ type: 'decal', id: 'BotGreyscale' });
      expect(dispatched.find(a => a.type === 'SET_TOOL').tool).toBe('paint');
    });

    it('entity takes priority over decal on click', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const d1 = makeDecal(10, 'BotGreyscale', 5, 5);
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel', [d1]);

      tool.onMouseDown(ctx, 5, 5, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction.item.type).toBe('entity');
    });

    it('applies picked decal color to placement settings', () => {
      const tool = new EyedropperTool();
      const d1 = makeDecal(1, 'BotGreyscale', 3, 3, '#00FF00CC');
      const { ctx, getDecalColor } = makeToolContext([], null, [d1]);

      tool.onMouseDown(ctx, 3, 3, 0);

      expect(getDecalColor()).toBe('#00FF00CC');
    });

    it('includes decals in scroll picker', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const d1 = makeDecal(10, 'BotGreyscale', 5, 5, '#FF0000FF');
      const { ctx } = makeToolContext([e1], 'FloorSteel', [d1]);

      tool.onWheel!(ctx, 5, 5, 1);

      const items = tool.getPickerState().items;
      expect(items).toHaveLength(3); // entity + decal + tile
      expect(items[0].type).toBe('entity');
      expect(items[1].type).toBe('decal');
      expect(items[1].id).toBe('BotGreyscale');
      expect(items[2].type).toBe('tile');
    });

    it('handles null color decals in picker', () => {
      const tool = new EyedropperTool();
      const d1 = makeDecal(1, 'BotGreyscale', 3, 3, null);
      const { ctx, getDecalColor } = makeToolContext([], 'FloorSteel', [d1]);

      tool.onMouseDown(ctx, 3, 3, 0);

      expect(getDecalColor()).toBeNull();
    });
  });

  describe('layer visibility filtering', () => {
    beforeEach(() => {
      clearDrawDepthCache();
    });

    it('skips hidden-layer entities and picks decal instead', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'ChairOffice', 5, 5);
      const d1 = makeDecal(10, 'BotGreyscale', 5, 5, '#FF0000FF');
      // Hide objects layer, show decals
      const layers: LayerVisibility = { ...DEFAULT_LAYER_VISIBILITY, objects: false, decals: true };
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel', [d1], layers);

      tool.onMouseDown(ctx, 5, 5, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction).toBeDefined();
      expect(paletteAction.item.type).toBe('decal');
      expect(paletteAction.item.id).toBe('BotGreyscale');
    });

    it('skips hidden decal layer and picks entity instead', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const d1 = makeDecal(10, 'BotGreyscale', 5, 5);
      const layers: LayerVisibility = { ...DEFAULT_LAYER_VISIBILITY, objects: true, decals: false };
      const { ctx, dispatched } = makeToolContext([e1], 'FloorSteel', [d1], layers);

      tool.onMouseDown(ctx, 5, 5, 0);

      const paletteAction = dispatched.find(a => a.type === 'SET_PALETTE_ITEM');
      expect(paletteAction.item.type).toBe('entity');
    });

    it('scroll picker only shows visible layer items', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const d1 = makeDecal(10, 'BotGreyscale', 5, 5, '#FF0000FF');
      // Hide objects, show decals
      const layers: LayerVisibility = { ...DEFAULT_LAYER_VISIBILITY, objects: false, decals: true };
      const { ctx } = makeToolContext([e1], 'FloorSteel', [d1], layers);

      tool.onWheel!(ctx, 5, 5, 1);

      const items = tool.getPickerState().items;
      // Only decal + tile (entity hidden)
      expect(items).toHaveLength(2);
      expect(items[0].type).toBe('decal');
      expect(items[1].type).toBe('tile');
    });

    it('picks nothing when all layers hidden and only Space tile', () => {
      const tool = new EyedropperTool();
      const e1 = makeEntity(1, 'APCBasic', 5, 5);
      const layers: LayerVisibility = { ...DEFAULT_LAYER_VISIBILITY, objects: false };
      const { ctx, dispatched } = makeToolContext([e1], 'Space', [], layers);

      tool.onMouseDown(ctx, 5, 5, 0);

      expect(dispatched).toHaveLength(0);
    });
  });
});
