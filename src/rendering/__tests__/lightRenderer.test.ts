import { describe, it, expect } from 'vitest';
import {
  extractLightInfo,
  computeGradientStops,
  colorToRgb,
  renderLightmap,
  collectVisibleLights,
} from '../lightRenderer';
import type { VisibleLight } from '../lightRenderer';
import { buildWallSegmentCache } from '../wallSegments';
import { rebuildSpatialIndex } from '../spatialIndex';
import type { IPrototypeRegistry } from '../../loaders/registryTypes';
import type { ImportedEntity } from '../../import/mapImporter';

function makeEntity(components: Record<string, unknown>[]): ImportedEntity {
  return {
    uid: 1,
    prototype: 'PoweredLight',
    position: { x: 5, y: 5 },
    rotation: 0,
    components,
  };
}

function makeRegistry(protoComponents: Record<string, unknown>[]): IPrototypeRegistry {
  return {
    getEntity: () => ({
      id: 'PoweredLight',
      name: 'Powered Light',
      description: '',
      suffix: '',
      abstract: false,
      categories: [],
      placement: {},
      components: protoComponents as any,
      spriteInfo: null,
      sourceCategory: '',
      raw: { type: 'entity', id: 'PoweredLight' },
    }),
    getTile: () => null,
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

describe('extractLightInfo', () => {
  it('returns null when entity has no PointLight', () => {
    const entity = makeEntity([{ type: 'Transform' }]);
    expect(extractLightInfo(entity, null)).toBeNull();
  });

  it('extracts light info from entity instance PointLight', () => {
    const entity = makeEntity([{ type: 'PointLight', color: '#FF0000', radius: 8, energy: 2.0, softness: 1.5 }]);
    const info = extractLightInfo(entity, null);
    expect(info).not.toBeNull();
    expect(info!.color).toBe('#FF0000');
    expect(info!.radius).toBe(8);
    expect(info!.energy).toBe(2.0);
    expect(info!.softness).toBe(1.5);
    expect(info!.enabled).toBe(true);
  });

  it('uses defaults for missing fields', () => {
    const entity = makeEntity([{ type: 'PointLight' }]);
    const info = extractLightInfo(entity, null);
    expect(info).not.toBeNull();
    expect(info!.color).toBe('#FFFFFF');
    expect(info!.radius).toBe(5);
    expect(info!.energy).toBe(1.0);
    expect(info!.softness).toBe(1.0);
    expect(info!.falloff).toBe(6.8);
    expect(info!.enabled).toBe(true);
    expect(info!.offset.x).toBe(0);
    expect(info!.offset.y).toBe(0);
  });

  it('extracts falloff from PointLight component', () => {
    const entity = makeEntity([{ type: 'PointLight', falloff: 3.0 }]);
    const info = extractLightInfo(entity, null);
    expect(info!.falloff).toBe(3.0);
  });

  it('falls back to prototype PointLight when entity has none', () => {
    const entity = makeEntity([{ type: 'Transform' }]);
    const registry = makeRegistry([{ type: 'PointLight', color: '#FFE4CE', radius: 10, energy: 0.8 }]);
    const info = extractLightInfo(entity, registry);
    expect(info).not.toBeNull();
    expect(info!.color).toBe('#FFE4CE');
    expect(info!.radius).toBe(10);
    expect(info!.energy).toBe(0.8);
  });

  it('instance PointLight fields override prototype fields', () => {
    const entity = makeEntity([{ type: 'PointLight', color: '#FF0000' }]);
    const registry = makeRegistry([{ type: 'PointLight', color: '#FFE4CE', radius: 10, energy: 0.8, softness: 1.0 }]);
    const info = extractLightInfo(entity, registry);
    expect(info!.color).toBe('#FF0000');
    // Non-overridden fields come from prototype
    expect(info!.radius).toBe(10);
    expect(info!.energy).toBe(0.8);
  });

  it('respects enabled: false', () => {
    const entity = makeEntity([{ type: 'PointLight', enabled: false, color: '#00FF00' }]);
    const info = extractLightInfo(entity, null);
    expect(info!.enabled).toBe(false);
  });

  it('parses offset string "0, -0.5"', () => {
    const entity = makeEntity([{ type: 'PointLight', offset: '0, -0.5' }]);
    const info = extractLightInfo(entity, null);
    expect(info!.offset.x).toBe(0);
    expect(info!.offset.y).toBe(-0.5);
  });

  it('returns null when prototype also has no PointLight', () => {
    const entity = makeEntity([{ type: 'Transform' }]);
    const registry = makeRegistry([{ type: 'Transform' }]);
    expect(extractLightInfo(entity, registry)).toBeNull();
  });
});

function parseAlpha(rgba: string): number {
  const match = rgba.match(/[\d.]+\)$/);
  return match ? parseFloat(match[0]) : 0;
}

describe('computeGradientStops', () => {
  it('returns multiple stops approximating SS14 attenuation curve', () => {
    const stops = computeGradientStops('#FF0000', 1.0, 6.8);
    expect(stops.length).toBeGreaterThanOrEqual(5);
    // First stop at center
    expect(stops[0].offset).toBe(0);
    // Last stop at edge
    expect(stops[stops.length - 1].offset).toBe(1);
    // Edge should be near-zero alpha (attenuation at s=1 is 0)
    expect(parseAlpha(stops[stops.length - 1].color)).toBeCloseTo(0, 3);
  });

  it('center is brightest, monotonically decreasing', () => {
    const stops = computeGradientStops('#FFFFFF', 1.0, 6.8);
    for (let i = 1; i < stops.length; i++) {
      expect(parseAlpha(stops[i].color)).toBeLessThanOrEqual(parseAlpha(stops[i - 1].color));
    }
  });

  it('higher energy increases alpha at all stops', () => {
    const low = computeGradientStops('#FFFFFF', 0.5, 6.8);
    const high = computeGradientStops('#FFFFFF', 2.0, 6.8);
    // Center stop should be brighter with higher energy
    expect(parseAlpha(high[0].color)).toBeGreaterThan(parseAlpha(low[0].color));
  });

  it('higher falloff makes light drop off faster', () => {
    const gentle = computeGradientStops('#FFFFFF', 1.0, 1.0);
    const steep = computeGradientStops('#FFFFFF', 1.0, 10.0);
    // Mid-range stop should be dimmer with higher falloff
    const midIdx = Math.floor(gentle.length / 2);
    expect(parseAlpha(steep[midIdx].color)).toBeLessThan(parseAlpha(gentle[midIdx].color));
  });

  it('applies light color to stops', () => {
    const stops = computeGradientStops('#FF0000', 1.0, 6.8);
    expect(stops[0].color).toContain('255'); // red channel
    expect(stops[0].color).toContain(', 0,'); // green = 0
  });

  it('resolves named colors instead of collapsing them to black (#25)', () => {
    // parseInt('re', 16) -> NaN -> 0 was the old path: a named color became
    // rgba(0,0,0,..) and the additive tint pass contributed nothing.
    const stops = computeGradientStops('green', 1.0, 6.8);
    expect(stops[0].color).toBe(`rgba(0, 128, 0, ${(1).toFixed(4)})`);
  });

  it('falls back to white, never black, for unparseable colors', () => {
    const stops = computeGradientStops('not-a-color', 1.0, 6.8);
    expect(stops[0].color).toContain('255, 255, 255');
  });
});

describe('colorToRgb', () => {
  it.each([
    ['#FF0000', { r: 255, g: 0, b: 0 }],
    ['#ff8000', { r: 255, g: 128, b: 0 }],
    ['#F80', { r: 255, g: 136, b: 0 }], // #RGB shorthand expands per-digit
    ['#FF8000CC', { r: 255, g: 128, b: 0 }], // alpha digits ignored
  ])('parses hex %s', (input, expected) => {
    expect(colorToRgb(input)).toEqual(expected);
  });

  // Every name observed on PointLight.color in the fork corpus survey,
  // in the casing the prototypes actually use.
  it.each([
    ['green', '#008000'],
    ['Red', '#FF0000'],
    ['orange', '#FFA500'],
    ['darkorange', '#FF8C00'],
    ['orangered', '#FF4500'],
    ['OrangeRed', '#FF4500'],
    ['SkyBlue', '#87CEEB'],
    ['deepskyblue', '#00BFFF'],
    ['lightblue', '#ADD8E6'],
    ['LightGreen', '#90EE90'],
    ['MediumPurple', '#9370DB'],
    ['plum', '#DDA0DD'],
    ['Lime', '#00FF00'],
    ['cyan', '#00FFFF'],
    ['yellow', '#FFFF00'],
    ['white', '#FFFFFF'],
    ['blue', '#0000FF'],
  ])('resolves corpus named color %s', (name, hex) => {
    expect(colorToRgb(name)).toEqual(colorToRgb(hex));
    expect(colorToRgb(name)).not.toBeNull();
  });

  it.each([['not-a-color'], ['#GGGGGG'], ['#12345'], ['']])('returns null for %s', (input) => {
    expect(colorToRgb(input)).toBeNull();
  });
});

describe('PointLight export compatibility', () => {
  it('PointLight component override uses SS14-compatible field names', () => {
    // Simulate what LightEditor produces when changing color
    const entity = makeEntity([
      { type: 'Transform' },
      { type: 'PointLight', color: '#FF0000', radius: 12, energy: 2.5, enabled: true },
    ]);
    const pointLight = entity.components.find((c) => c.type === 'PointLight') as Record<string, unknown>;

    // These exact field names are what SS14 expects
    expect(pointLight.type).toBe('PointLight');
    expect(pointLight.color).toBe('#FF0000');
    expect(pointLight.radius).toBe(12);
    expect(pointLight.energy).toBe(2.5);
    expect(pointLight.enabled).toBe(true);
  });

  it('extractLightInfo round-trips through component override', () => {
    // Start with prototype defaults
    const registry = makeRegistry([{ type: 'PointLight', color: '#FFE4CE', radius: 10, energy: 0.8, softness: 1.0 }]);

    // Entity with a color override only
    const entity = makeEntity([{ type: 'PointLight', color: '#00FF00' }]);

    const info = extractLightInfo(entity, registry);
    expect(info).not.toBeNull();
    // Overridden field
    expect(info!.color).toBe('#00FF00');
    // Prototype fields preserved
    expect(info!.radius).toBe(10);
    expect(info!.energy).toBe(0.8);
    expect(info!.softness).toBe(1.0);
  });
});

// --- Shadow integration tests ---

function mockCamera() {
  return {
    x: 0,
    y: 0,
    worldToScreenX: (wx: number, _w: number) => wx * 32,
    worldToScreenY: (wy: number, _h: number) => wy * 32,
    zoom: 1,
  };
}

function makeOccluderRegistry(): IPrototypeRegistry {
  return {
    getEntity: (id: string) => ({
      id,
      name: id,
      description: '',
      suffix: '',
      abstract: false,
      categories: [],
      placement: {},
      components: [{ type: 'Occluder' }, { type: 'Transform' }],
      spriteInfo: null,
      sourceCategory: '',
      raw: { type: 'entity' as const, id },
    }),
    getTile: () => null,
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

function createMockCanvasContext() {
  const noop = () => {};
  return {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    fillRect: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    clip: noop,
    rect: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
  };
}

/**
 * Recording variant: captures each radial gradient's stops together with the
 * composite operation active when it was created, plus clip-rect calls. jsdom
 * has no rasterizer (setupDom stubs getContext as a recorder), so compositing
 * behavior is asserted through the recorded draw commands, not pixels.
 */
function createRecordingCanvasContext() {
  const gradients: { op: string; stops: { offset: number; color: string }[] }[] = [];
  const rects: number[][] = [];
  const ctx = {
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown,
    fillRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    clip: () => {},
    rect: (...args: number[]) => {
      rects.push(args);
    },
    createRadialGradient: () => {
      const record = { op: ctx.globalCompositeOperation, stops: [] as { offset: number; color: string }[] };
      gradients.push(record);
      return {
        addColorStop: (offset: number, color: string) => {
          record.stops.push({ offset, color });
        },
      };
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, gradients, rects };
}

describe('renderLightmap shadow integration', () => {
  it('accepts optional WallSegmentCache parameter', () => {
    const ctx = createMockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = mockCamera();
    const registry = makeOccluderRegistry();

    // Create a light entity and a wall entity
    const lightEntity: ImportedEntity = {
      uid: 1,
      prototype: 'PoweredLight',
      position: { x: 5, y: 5 },
      rotation: 0,
      components: [{ type: 'PointLight', color: '#FFFFFF', radius: 5, energy: 1.0 }],
    };
    const wallEntity: ImportedEntity = {
      uid: 2,
      prototype: 'Wall',
      position: { x: 8, y: 5 },
      rotation: 0,
      components: [],
    };

    const wallCache = buildWallSegmentCache([wallEntity], registry);

    // Should not throw when called with 7 args (including wallCache)
    expect(() => {
      renderLightmap(ctx, [lightEntity], registry, camera, 800, 600, wallCache);
    }).not.toThrow();
  });

  it('works without WallSegmentCache (backward compatible)', () => {
    const ctx = createMockCanvasContext() as unknown as CanvasRenderingContext2D;
    const camera = mockCamera();

    const lightEntity: ImportedEntity = {
      uid: 1,
      prototype: 'PoweredLight',
      position: { x: 5, y: 5 },
      rotation: 0,
      components: [{ type: 'PointLight', color: '#FFFFFF', radius: 5, energy: 1.0 }],
    };

    // Should not throw when called with 6 args (no wallCache)
    expect(() => {
      renderLightmap(ctx, [lightEntity], null, camera, 800, 600);
    }).not.toThrow();
  });
});

describe('renderLightmap compositing (#25)', () => {
  function makeIndexedLight(energy: number, color = '#FFFFFF'): ImportedEntity {
    return {
      uid: 1,
      prototype: 'PoweredLight',
      position: { x: 5, y: 5 },
      rotation: 0,
      components: [{ type: 'PointLight', color, radius: 5, energy, enabled: true }],
    };
  }

  it('darkness punch reaches full clear at the center regardless of energy', () => {
    const light = makeIndexedLight(0.8); // stock wall light energy
    rebuildSpatialIndex([light]);
    const { ctx, gradients } = createRecordingCanvasContext();

    renderLightmap(ctx, [light], null, mockCamera(), 800, 600);

    const punch = gradients.find((g) => g.op === 'destination-out');
    expect(punch).toBeDefined();
    // Center stop alpha must be 1.0: with the old attenuation*energy alpha a
    // 0.8-energy light could never clear its own center (0.6 ambient cut only
    // to 0.12 residual darkness, ~muddy everywhere).
    expect(punch!.stops[0].color).toBe(`rgba(255, 255, 255, ${(1).toFixed(4)})`);
  });

  it('tint pass still scales with energy', () => {
    const light = makeIndexedLight(0.5, '#FF0000');
    rebuildSpatialIndex([light]);
    const { ctx, gradients } = createRecordingCanvasContext();

    renderLightmap(ctx, [light], null, mockCamera(), 800, 600);

    const tint = gradients.find((g) => g.op === 'lighter');
    expect(tint).toBeDefined();
    // Tint center alpha = energy * 0.4
    expect(tint!.stops[0].color).toBe(`rgba(255, 0, 0, ${(0.5 * 0.4).toFixed(4)})`);
  });

  it('clips the whole effect to the grid rect when bounds are provided', () => {
    const light = makeIndexedLight(1.0);
    rebuildSpatialIndex([light]);
    const { ctx, rects } = createRecordingCanvasContext();
    const camera = mockCamera();

    const bounds = { offsetX: -2, offsetY: -3, width: 10, height: 8 };
    renderLightmap(ctx, [light], null, camera, 800, 600, undefined, bounds);

    expect(rects).toHaveLength(1);
    const [x, y, w, h] = rects[0];
    // mockCamera maps world tile n to n*32 on both axes; tileSize = 32.
    expect(x).toBe(camera.worldToScreenX(bounds.offsetX, 800));
    expect(y).toBe(camera.worldToScreenY(bounds.offsetY + bounds.height - 1, 600));
    expect(w).toBe(bounds.width * 32);
    expect(h).toBe(bounds.height * 32);
  });

  it('skips the clip entirely without bounds or with an empty grid', () => {
    const light = makeIndexedLight(1.0);
    rebuildSpatialIndex([light]);

    const noBounds = createRecordingCanvasContext();
    renderLightmap(noBounds.ctx, [light], null, mockCamera(), 800, 600);
    expect(noBounds.rects).toHaveLength(0);

    const emptyGrid = createRecordingCanvasContext();
    renderLightmap(emptyGrid.ctx, [light], null, mockCamera(), 800, 600, undefined, {
      offsetX: 0,
      offsetY: 0,
      width: 0,
      height: 0,
    });
    expect(emptyGrid.rects).toHaveLength(0);
  });
});

// --- collectVisibleLights tests ---

function makeLightEntity(uid: number, x: number, y: number, radius = 5): ImportedEntity {
  return {
    uid,
    prototype: 'TestLight',
    position: { x, y },
    rotation: 0,
    components: [{ type: 'PointLight', radius, color: '#FFFFFF', energy: 1, enabled: true }],
  };
}

const nullRegistry: IPrototypeRegistry = {
  getEntity: () => null,
  getTile: () => null,
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

describe('collectVisibleLights', () => {
  // Camera centered at (25, 25), tileScreenSize=32 means 1 tile = 32px
  // Canvas 800x600 => viewport ~25 tiles wide, ~18.75 tiles tall
  // World viewport: roughly x=[12.5, 37.5], y=[15.6, 34.4] (centered at 25,25)
  const camera = { x: 25, y: 25, tileScreenSize: 32 };
  const canvasW = 800;
  const canvasH = 600;

  it('returns empty array when no lights are in viewport', () => {
    // Light far outside viewport
    const entities = [makeLightEntity(1, 100, 100, 5)];
    rebuildSpatialIndex(entities);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toEqual([]);
  });

  it('includes lights inside viewport', () => {
    // Light at center of viewport
    const entities = [makeLightEntity(1, 25, 25, 5)];
    rebuildSpatialIndex(entities);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toHaveLength(1);
    expect(result[0].light.radius).toBe(5);
  });

  it('includes lights whose radius overlaps viewport edge', () => {
    // Light just outside viewport but with large radius that overlaps
    // Viewport right edge is ~37.5. Place light at x=40 with radius=5 => reaches to x=35 which is inside viewport
    const entities = [makeLightEntity(1, 40, 25, 8)];
    rebuildSpatialIndex(entities);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toHaveLength(1);
  });

  describe('mount offset orientation (#25 "lights shining backwards")', () => {
    // The stock PoweredLight offset: half a tile out of the wall, into the
    // room, in entity-local y-up coordinates.
    function makeOffsetLight(rotation: number): ImportedEntity {
      return {
        uid: 1,
        prototype: 'PoweredLight',
        position: { x: 25, y: 25 },
        rotation,
        components: [{ type: 'PointLight', radius: 5, color: '#FFFFFF', energy: 1, enabled: true, offset: '0, -0.5' }],
      };
    }

    function collect(rotation: number): VisibleLight {
      rebuildSpatialIndex([makeOffsetLight(rotation)]);
      const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
      expect(result).toHaveLength(1);
      return result[0];
    }

    // Entity center on screen: cx = 400+16, cy = -(25+1-25)*32 + 300+16.
    const cx = 416;
    const cy = 284;

    it('rotation 0 (facing south): light hangs BELOW the fixture on screen', () => {
      const l = collect(0);
      expect(l.lx).toBeCloseTo(cx);
      // World -0.5 y = down = larger screen y. The old math put it above
      // (into the wall), which is the mirrored pool in the field reports.
      expect(l.ly).toBeCloseTo(cy + 16);
      expect(l.worldY).toBeCloseTo(25.0); // 25 + 0.5 - 0.5, shadow origin too
    });

    it('rotation pi (facing north): light sits ABOVE the fixture on screen', () => {
      const l = collect(Math.PI);
      expect(l.lx).toBeCloseTo(cx);
      expect(l.ly).toBeCloseTo(cy - 16);
      expect(l.worldY).toBeCloseTo(26.0);
    });

    it('rotation pi/2 (facing east): light sits RIGHT of the fixture on screen', () => {
      // rotationToDirection maps pi/2 to east; the offset must follow the
      // same convention or lights disagree with their sprites.
      const l = collect(Math.PI / 2);
      expect(l.lx).toBeCloseTo(cx + 16);
      expect(l.ly).toBeCloseTo(cy);
      expect(l.worldX).toBeCloseTo(26.0);
    });
  });

  it('excludes lights far outside viewport even with large radius', () => {
    // Light very far away - radius can't reach viewport
    const entities = [makeLightEntity(1, 100, 100, 5)];
    rebuildSpatialIndex(entities);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toHaveLength(0);
  });

  it('excludes disabled lights', () => {
    const entity: ImportedEntity = {
      uid: 1,
      prototype: 'TestLight',
      position: { x: 25, y: 25 },
      rotation: 0,
      components: [{ type: 'PointLight', radius: 5, color: '#FFFFFF', energy: 1, enabled: false }],
    };
    rebuildSpatialIndex([entity]);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toHaveLength(0);
  });

  it('excludes entities without PointLight component', () => {
    const entity: ImportedEntity = {
      uid: 1,
      prototype: 'Wall',
      position: { x: 25, y: 25 },
      rotation: 0,
      components: [{ type: 'Transform' }],
    };
    rebuildSpatialIndex([entity]);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toHaveLength(0);
  });

  it('returns correct VisibleLight fields', () => {
    const entities = [makeLightEntity(1, 25, 25, 7)];
    rebuildSpatialIndex(entities);
    const result = collectVisibleLights(nullRegistry, camera, canvasW, canvasH);
    expect(result).toHaveLength(1);
    const vl: VisibleLight = result[0];
    expect(vl.light.radius).toBe(7);
    expect(vl.light.color).toBe('#FFFFFF');
    expect(vl.entityTileX).toBe(25);
    expect(vl.entityTileY).toBe(25);
    expect(typeof vl.lx).toBe('number');
    expect(typeof vl.ly).toBe('number');
    expect(typeof vl.radiusPx).toBe('number');
  });
});
