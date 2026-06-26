import { describe, it, expect } from 'vitest';
import { resolveEntities, resolveTiles, extractSpriteInfo } from '../prototypeResolver';
import type { RawEntityPrototype, RawTilePrototype } from '../registryTypes';

describe('resolveTiles', () => {
  it('converts raw tile to resolved tile', () => {
    const raw: RawTilePrototype = {
      type: 'tile',
      id: 'FloorSteel',
      name: 'tiles-steel-floor',
      sprite: '/Textures/Tiles/steel.png',
      variants: 4,
      isSubfloor: false,
      baseTurf: 'Plating',
    };
    const result = resolveTiles([raw]);
    expect(result.get('FloorSteel')).toBeDefined();
    expect(result.get('FloorSteel')!.sprite).toBe('/Textures/Tiles/steel.png');
    expect(result.get('FloorSteel')!.variants).toBe(4);
    expect(result.get('FloorSteel')!.isSubfloor).toBe(false);
  });

  it('defaults missing fields', () => {
    const raw: RawTilePrototype = { type: 'tile', id: 'Space' };
    const result = resolveTiles([raw]);
    const space = result.get('Space')!;
    expect(space.sprite).toBeNull();
    expect(space.variants).toBe(1);
    expect(space.isSubfloor).toBe(true);
  });
});

describe('resolveEntities', () => {
  it('merges parent chain components', () => {
    const grandparent: RawEntityPrototype = {
      type: 'entity', id: 'Base', abstract: true,
      components: [
        { type: 'Sprite', sprite: 'default.rsi', layers: [{ state: 'icon' }] },
        { type: 'Physics' },
      ],
    };
    const parent: RawEntityPrototype = {
      type: 'entity', id: 'Mid', parent: 'Base', abstract: true,
      components: [
        { type: 'Sprite', sprite: 'override.rsi', layers: [{ state: 'base' }] },
      ],
    };
    const child: RawEntityPrototype = {
      type: 'entity', id: 'Concrete', parent: 'Mid', name: 'My Entity',
      components: [
        { type: 'Battery', maxCharge: 50000 },
      ],
    };

    const entries = [
      { proto: grandparent, category: 'Base' },
      { proto: parent, category: 'Base' },
      { proto: child, category: 'Structures/Power' },
    ];

    const result = resolveEntities(entries);
    const concrete = result.get('Concrete')!;

    // Should have 3 components: Sprite (overridden), Physics (inherited), Battery (own)
    expect(concrete.components).toHaveLength(3);
    // Sprite should be the child-most override
    const sprite = concrete.components.find(c => c.type === 'Sprite');
    expect(sprite?.sprite).toBe('override.rsi');
    // Physics inherited from grandparent
    expect(concrete.components.find(c => c.type === 'Physics')).toBeDefined();
    // Category from source file
    expect(concrete.sourceCategory).toBe('Structures/Power');
  });

  it('handles missing parents gracefully', () => {
    const entity: RawEntityPrototype = {
      type: 'entity', id: 'Orphan', parent: 'NonExistent',
      components: [{ type: 'Sprite', sprite: 'thing.rsi', layers: [{ state: 'icon' }] }],
    };
    const result = resolveEntities([{ proto: entity, category: 'Other' }]);
    expect(result.get('Orphan')).toBeDefined();
  });

  it('excludes abstract entities from results', () => {
    const abs: RawEntityPrototype = { type: 'entity', id: 'Base', abstract: true, components: [] };
    const concrete: RawEntityPrototype = { type: 'entity', id: 'Real', parent: 'Base', components: [] };
    const result = resolveEntities([
      { proto: abs, category: 'Other' },
      { proto: concrete, category: 'Other' },
    ]);
    expect(result.has('Base')).toBe(false);
    expect(result.has('Real')).toBe(true);
  });
});

describe('extractSpriteInfo', () => {
  it('extracts sprite info from Sprite component', () => {
    const components = [
      {
        type: 'Sprite',
        sprite: 'Structures/Power/apc.rsi',
        drawdepth: 'WallMountedItems',
        layers: [
          { state: 'base' },
          { state: 'panel', visible: false },
        ],
      },
    ];
    const info = extractSpriteInfo(components);
    expect(info).not.toBeNull();
    expect(info!.rsiPath).toBe('Structures/Power/apc.rsi');
    expect(info!.baseState).toBe('base');
    expect(info!.layers).toHaveLength(2);
  });

  it('returns null when no Sprite component', () => {
    const info = extractSpriteInfo([{ type: 'Physics' }]);
    expect(info).toBeNull();
  });

  it('uses direct state field when layers is empty', () => {
    const info = extractSpriteInfo([
      { type: 'Sprite', sprite: 'Markers/jobs.rsi', state: 'green' },
    ]);
    expect(info).not.toBeNull();
    expect(info!.baseState).toBe('green');
  });
});

describe('EntityStorageVisuals override', () => {
  it('uses stateBaseClosed from EntityStorageVisuals as baseState', () => {
    const components = [
      { type: 'Sprite', sprite: 'Structures/Storage/closet.rsi', layers: [{ state: 'generic' }] },
      { type: 'EntityStorageVisuals', stateBaseClosed: 'bssecure', stateDoorOpen: 'bssecure_open', stateDoorClosed: 'bssecure_door' },
    ];
    const info = extractSpriteInfo(components);
    expect(info).not.toBeNull();
    expect(info!.baseState).toBe('bssecure');
  });

  it('keeps original baseState when EntityStorageVisuals has no stateBaseClosed', () => {
    const components = [
      { type: 'Sprite', sprite: 'Structures/Storage/closet.rsi', layers: [{ state: 'generic' }] },
      { type: 'EntityStorageVisuals', stateDoorOpen: 'generic_open' },
    ];
    const info = extractSpriteInfo(components);
    expect(info).not.toBeNull();
    expect(info!.baseState).toBe('generic');
  });

  it('keeps original baseState when no EntityStorageVisuals present', () => {
    const components = [
      { type: 'Sprite', sprite: 'Structures/Power/apc.rsi', layers: [{ state: 'base' }] },
    ];
    const info = extractSpriteInfo(components);
    expect(info!.baseState).toBe('base');
  });

  it('resolves locker inheritance with EntityStorageVisuals override', () => {
    // Simulates: LockerBase → LockerBaseSecure → LockerBlueshield
    const lockerBase: RawEntityPrototype = {
      type: 'entity', id: 'LockerBase', abstract: true,
      components: [
        { type: 'Sprite', sprite: 'Structures/Storage/closet.rsi', layers: [{ state: 'generic' }] },
        { type: 'EntityStorageVisuals', stateBaseClosed: 'generic', stateDoorOpen: 'generic_open' },
      ],
    };
    const lockerSecure: RawEntityPrototype = {
      type: 'entity', id: 'LockerBaseSecure', parent: 'LockerBase', abstract: true,
      components: [],
    };
    const lockerBSO: RawEntityPrototype = {
      type: 'entity', id: 'LockerBlueshield', parent: 'LockerBaseSecure',
      name: 'blue shield locker',
      components: [
        { type: 'EntityStorageVisuals', stateBaseClosed: 'bssecure', stateDoorOpen: 'bssecure_open', stateDoorClosed: 'bssecure_door' },
      ],
    };
    const lockerRep: RawEntityPrototype = {
      type: 'entity', id: 'LockerRepresentative', parent: 'LockerBaseSecure',
      name: 'representative locker',
      components: [
        { type: 'EntityStorageVisuals', stateBaseClosed: 'hop', stateDoorOpen: 'hop_open', stateDoorClosed: 'representative_door' },
      ],
    };

    const result = resolveEntities([
      { proto: lockerBase, category: 'Storage' },
      { proto: lockerSecure, category: 'Storage' },
      { proto: lockerBSO, category: 'Storage' },
      { proto: lockerRep, category: 'Storage' },
    ]);

    const bso = result.get('LockerBlueshield')!;
    expect(bso.spriteInfo).not.toBeNull();
    expect(bso.spriteInfo!.rsiPath).toBe('Structures/Storage/closet.rsi');
    expect(bso.spriteInfo!.baseState).toBe('bssecure');

    const rep = result.get('LockerRepresentative')!;
    expect(rep.spriteInfo).not.toBeNull();
    expect(rep.spriteInfo!.baseState).toBe('hop');
  });
});

describe('layer sprite override vs leaked parent sprite', () => {
  it('uses layer sprite when all layers have own sprite paths (hydroponicsTray pattern)', () => {
    // Parent: simple sprite+state mode (soil)
    // Child: layers mode with per-layer sprite paths (tray)
    // Shallow merge leaks parent sprite/state, extractSpriteInfo should prefer layers
    const soil: RawEntityPrototype = {
      type: 'entity', id: 'hydroponicsSoil', abstract: true,
      components: [
        { type: 'Sprite', sprite: 'Structures/Hydroponics/misc.rsi', state: 'soil', noRot: true },
      ],
    };
    const tray: RawEntityPrototype = {
      type: 'entity', id: 'hydroponicsTray', parent: 'hydroponicsSoil',
      name: 'hydroponics tray',
      components: [
        {
          type: 'Sprite',
          layers: [
            { sprite: 'Structures/Hydroponics/containers.rsi', state: 'hydrotray3' },
            { sprite: 'Structures/Hydroponics/overlays.rsi', state: 'lowhealth3', visible: false },
          ],
        },
      ],
    };

    const result = resolveEntities([
      { proto: soil, category: 'Structures' },
      { proto: tray, category: 'Structures' },
    ]);

    const resolved = result.get('hydroponicsTray')!;
    expect(resolved.spriteInfo).not.toBeNull();
    expect(resolved.spriteInfo!.rsiPath).toBe('Structures/Hydroponics/containers.rsi');
    expect(resolved.spriteInfo!.baseState).toBe('hydrotray3');
  });

  it('keeps top-level sprite when some layers rely on it (GasVentPump pattern)', () => {
    // Top-level sprite is the default RSI, layer 1 has no own sprite
    const info = extractSpriteInfo([
      {
        type: 'Sprite',
        sprite: 'Structures/Piping/Atmospherics/vent.rsi',
        layers: [
          { sprite: 'Structures/Piping/pipe.rsi', state: 'pipeUnaryConnectors' },
          { state: 'vent_off' },
        ],
      },
    ]);
    expect(info).not.toBeNull();
    expect(info!.rsiPath).toBe('Structures/Piping/Atmospherics/vent.rsi');
    expect(info!.baseState).toBe('vent_off');
  });
});

describe('component shallow merge', () => {
  it('preserves parent sprite path when child only adds layers', () => {
    // Simulates GasPipeStraight: parent has sprite path, child overrides with layers only
    const parent: RawEntityPrototype = {
      type: 'entity', id: 'GasPipeBase', abstract: true,
      parent: 'GasPipeSansLayers',
      components: [],
    };
    const grandparent: RawEntityPrototype = {
      type: 'entity', id: 'GasPipeSansLayers', abstract: true,
      components: [
        { type: 'Sprite', sprite: 'Structures/Piping/pipe.rsi', drawdepth: 'ThinPipe', visible: false },
      ],
    };
    const child: RawEntityPrototype = {
      type: 'entity', id: 'GasPipeStraight', parent: 'GasPipeBase',
      components: [
        { type: 'Sprite', layers: [{ state: 'pipeStraight', map: ['enum.PipeVisualLayers.Pipe'] }] },
      ],
    };

    const result = resolveEntities([
      { proto: grandparent, category: 'Piping' },
      { proto: parent, category: 'Piping' },
      { proto: child, category: 'Piping' },
    ]);

    const pipe = result.get('GasPipeStraight')!;
    expect(pipe).toBeDefined();
    expect(pipe.spriteInfo).not.toBeNull();
    expect(pipe.spriteInfo!.rsiPath).toBe('Structures/Piping/pipe.rsi');
    expect(pipe.spriteInfo!.baseState).toBe('pipeStraight');
    expect(pipe.spriteInfo!.drawDepth).toBe('ThinPipe');
  });
});

describe('IconSmooth Diagonal mode', () => {
  it('returns Diagonal mode for entities with mode: Diagonal', () => {
    const wallBase: RawEntityPrototype = {
      type: 'entity', id: 'WallDiagonalBase', abstract: true,
      components: [
        { type: 'IconSmooth', key: 'walls', mode: 'Diagonal' },
        { type: 'Sprite', sprite: 'Structures/Walls/solid_diagonal.rsi', state: 'state0' },
      ],
    };
    const wallDiag: RawEntityPrototype = {
      type: 'entity', id: 'WallSolidDiagonal', parent: 'WallDiagonalBase',
      name: 'solid wall diagonal',
      components: [],
    };

    const result = resolveEntities([
      { proto: wallBase, category: 'Walls' },
      { proto: wallDiag, category: 'Walls' },
    ]);

    const resolved = result.get('WallSolidDiagonal')!;
    expect(resolved.spriteInfo).not.toBeNull();
    expect(resolved.spriteInfo!.iconSmoothMode).toBe('Diagonal');
    expect(resolved.spriteInfo!.rsiPath).toBe('Structures/Walls/solid_diagonal.rsi');
    expect(resolved.spriteInfo!.baseState).toBe('state0');
  });

  it('does not return Diagonal for standard Corners mode walls', () => {
    const wall: RawEntityPrototype = {
      type: 'entity', id: 'WallSolid',
      components: [
        { type: 'IconSmooth', key: 'walls', base: 'solid' },
        { type: 'Sprite', sprite: 'Structures/Walls/solid.rsi', layers: [{ state: 'solid0' }] },
      ],
    };

    const result = resolveEntities([{ proto: wall, category: 'Walls' }]);
    const resolved = result.get('WallSolid')!;
    expect(resolved.spriteInfo!.iconSmoothMode).toBe('Corners');
  });
});
