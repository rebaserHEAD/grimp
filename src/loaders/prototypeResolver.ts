import type {
  RawTilePrototype,
  RawEntityPrototype,
  RawDecalPrototype,
  RawComponent,
  ResolvedTile,
  ResolvedEntity,
  DecalPrototypeInfo,
  SpriteInfo,
  SpriteLayerInfo,
} from './registryTypes';

/**
 * Convert raw tile prototypes into resolved tiles with defaulted fields.
 * Tiles have no inheritance, so this is a straightforward mapping.
 */
export function resolveTiles(rawTiles: RawTilePrototype[]): Map<string, ResolvedTile> {
  const result = new Map<string, ResolvedTile>();

  for (const raw of rawTiles) {
    const resolved: ResolvedTile = {
      id: raw.id,
      name: String(raw.name ?? raw.id),
      sprite: raw.sprite ?? null,
      variants: raw.variants ?? 1,
      isSubfloor: raw.isSubfloor ?? true,
      isSpace: raw.isSpace ?? false,
      baseTurf: raw.baseTurf ?? null,
      raw,
    };
    result.set(raw.id, resolved);
  }

  return result;
}

/**
 * Infer the IconSmooth base prefix.
 * If explicitly set in YAML, use that. Otherwise, try to infer from the baseState:
 * e.g., baseState "splat0" → base "splat" (used by puddles where PuddleSystem sets base at runtime).
 */
function inferSmoothBase(
  iconSmoothComp: RawComponent | undefined,
  baseState: string,
): string | undefined {
  if (!iconSmoothComp) return undefined;

  // Explicit base from YAML (e.g., "state_" for tables, "swindow" for shuttle windows)
  const explicitBase = iconSmoothComp.base as string | undefined;
  if (explicitBase) return explicitBase;

  // Infer from baseState: strip trailing digits (e.g., "splat0" → "splat")
  if (baseState && iconSmoothComp.key) {
    const match = baseState.match(/^([a-zA-Z_]+)\d+$/);
    if (match) return match[1];
  }

  return undefined;
}

/**
 * Determine the IconSmooth mode from the YAML field.
 * Default is 'Corners'. Supports 'Corners', 'CardinalFlags', and 'Diagonal'.
 */
function inferSmoothMode(
  iconSmoothComp: RawComponent | undefined,
): 'Corners' | 'CardinalFlags' | 'Diagonal' | undefined {
  if (!iconSmoothComp) return undefined;
  const mode = iconSmoothComp.mode as string | undefined;
  if (mode === 'CardinalFlags') return 'CardinalFlags';
  if (mode === 'Diagonal') return 'Diagonal';
  // Default mode is Corners, but for entities with inferred base (no explicit base),
  // the PuddleSystem sets them up as CardinalFlags at runtime.
  // Detect: if no explicit base and no explicit mode, check if base was inferred
  if (!iconSmoothComp.base && !mode) {
    // Entities like puddles that have IconSmooth key but no base/mode
    // use CardinalFlags via runtime systems. Use CardinalFlags as default for inferred bases.
    return 'CardinalFlags';
  }
  return 'Corners';
}

/**
 * Extract sprite rendering info from a list of merged components.
 * Returns null if no Sprite component is present.
 */
export function extractSpriteInfo(components: RawComponent[]): SpriteInfo | null {
  const spriteComp = components.find(c => c.type === 'Sprite');
  if (!spriteComp) return null;

  const rawLayers = (spriteComp.layers ?? []) as Array<Record<string, unknown>>;
  const layers: SpriteLayerInfo[] = rawLayers.map(l => ({
    state: (l.state as string) ?? '',
    sprite: l.sprite as string | undefined,
    map: l.map as string[] | undefined,
    visible: l.visible as boolean | undefined,
    shader: l.shader as string | undefined,
    color: l.color as string | undefined,
    scale: l.scale as { x: number; y: number } | undefined,
  }));

  // RSI path resolution: When layers exist, check if any layer relies on the top-level
  // sprite as its default RSI (has no own `sprite` field). If all layers specify their own
  // sprite paths, the top-level `sprite` is likely leaked from a parent's simple sprite+state
  // mode (e.g., hydroponicsSoil→hydroponicsTray) and should be ignored in favor of the
  // first visible layer's sprite. If some layers lack their own sprite, the top-level is
  // meaningful (e.g., GasVentPump where layer 1 relies on the top-level vent.rsi).
  const topLevelSprite = spriteComp.sprite as string | undefined;
  const anyLayerReliesOnTopLevel = layers.length > 0 && layers.some(l => !l.sprite);
  let rsiPath: string | undefined;

  if (layers.length > 0 && !anyLayerReliesOnTopLevel) {
    // All layers have own sprite, top-level is irrelevant/leaked from parent
    for (const layer of layers) {
      if (layer.sprite && layer.visible !== false) {
        rsiPath = layer.sprite;
        break;
      }
    }
  }

  if (!rsiPath) {
    rsiPath = topLevelSprite;
  }

  if (!rsiPath) {
    // Fall back to first visible layer's sprite
    for (const layer of layers) {
      if (layer.sprite && layer.visible !== false) {
        rsiPath = layer.sprite;
        break;
      }
    }
  }
  if (!rsiPath) return null;

  // baseState: prefer first layer's state that matches the top-level RSI, then direct state field.
  // Skip layers with their own `sprite` override (they reference a different RSI).
  // E.g., GasVentPump layers[0] has sprite=pipe.rsi with state=pipeUnaryConnectors,
  // but the top-level sprite is vent.rsi, we want layers[1].state=vent_off.
  const directState = spriteComp.state as string | undefined;
  let baseState = directState ?? '';
  for (const layer of layers) {
    if (!layer.state) continue;
    // If this layer has a sprite override pointing to a different RSI, skip it
    if (layer.sprite && layer.sprite !== rsiPath) continue;
    baseState = layer.state;
    break;
  }

  // EntityStorageVisuals override: lockers/crates define their closed-state sprite
  // via stateBaseClosed in the EntityStorageVisuals component, overriding the Sprite layer state.
  const storageVisuals = components.find(c => c.type === 'EntityStorageVisuals');
  if (storageVisuals?.stateBaseClosed) {
    baseState = storageVisuals.stateBaseClosed as string;
  }

  // Extract IconSmooth data (used for both baseState fallback and corner rendering info)
  const iconSmoothComp = components.find(c => c.type === 'IconSmooth');

  // IconSmooth fallback: entities with IconSmooth (tables, carpets, walls, windows) use
  // corner-based rendering with states `{base}0`-`{base}7`. For the default baseState
  // (used as palette preview and when corner rendering isn't available), prefer 'full'.
  if (!baseState && iconSmoothComp) {
    const iconComp = components.find(c => c.type === 'Icon');
    const iconState = iconComp?.state as string | undefined;
    baseState = iconState || 'full';
  }

  // Last resort: Icon component state (for non-IconSmooth entities)
  if (!baseState) {
    const iconComp = components.find(c => c.type === 'Icon');
    if (iconComp) {
      baseState = (iconComp.state as string) ?? '';
    }
  }

  return {
    rsiPath,
    baseState,
    drawDepth: spriteComp.drawdepth as string | undefined,
    noRot: spriteComp.noRot === true || (spriteComp as Record<string, unknown>).norot === true
      ? true : undefined,
    color: spriteComp.color as string | undefined,
    iconSmoothKey: iconSmoothComp?.key as string | undefined,
    iconSmoothBase: inferSmoothBase(iconSmoothComp, baseState),
    iconSmoothMode: inferSmoothMode(iconSmoothComp),
    layers,
  };
}

interface EntityEntry {
  proto: RawEntityPrototype;
  category: string;
}

/**
 * Merge components from a parent chain. Child components override parent
 * components by `type` field. Components from ancestors not overridden by
 * descendants are preserved.
 */
function mergeComponents(chain: RawEntityPrototype[]): RawComponent[] {
  // chain is ordered from root ancestor to leaf child
  // SS14 does a shallow field merge: child fields override parent fields,
  // but parent fields not present in the child are preserved.
  const merged = new Map<string, RawComponent>();

  for (const proto of chain) {
    for (const comp of proto.components ?? []) {
      const existing = merged.get(comp.type);
      if (existing) {
        // Shallow merge: spread parent fields, then child fields override
        merged.set(comp.type, { ...existing, ...comp });
      } else {
        merged.set(comp.type, comp);
      }
    }
  }

  return Array.from(merged.values());
}

/**
 * Resolve entity prototypes by merging parent chains.
 * Abstract entities are used for resolution but excluded from results.
 */
export function resolveEntities(
  entries: EntityEntry[],
): Map<string, ResolvedEntity> {
  // Index all prototypes by ID (including abstract ones, needed for resolution)
  const protoById = new Map<string, EntityEntry>();
  for (const entry of entries) {
    protoById.set(entry.proto.id, entry);
  }

  // Cache resolved chains to avoid recomputing
  const chainCache = new Map<string, RawEntityPrototype[]>();

  /**
   * Build the ancestor chain for a given prototype ID, from root to leaf.
   * Handles missing parents and circular references.
   */
  function buildChain(id: string, visited: Set<string> = new Set()): RawEntityPrototype[] {
    if (chainCache.has(id)) return chainCache.get(id)!;
    if (visited.has(id)) return []; // circular reference guard

    const entry = protoById.get(id);
    if (!entry) return []; // missing prototype

    visited.add(id);
    const proto = entry.proto;

    // Resolve parent(s), SS14 supports single or multiple parents
    const parentIds = proto.parent
      ? Array.isArray(proto.parent) ? proto.parent : [proto.parent]
      : [];

    // Collect ancestor chains (for multi-parent, merge in order)
    const ancestorChain: RawEntityPrototype[] = [];
    for (const parentId of parentIds) {
      const parentChain = buildChain(parentId, new Set(visited));
      for (const ancestor of parentChain) {
        // Avoid duplicates if multiple parents share ancestors
        if (!ancestorChain.some(a => a.id === ancestor.id)) {
          ancestorChain.push(ancestor);
        }
      }
    }

    const chain = [...ancestorChain, proto];
    chainCache.set(id, chain);
    return chain;
  }

  // Resolve all entities
  const result = new Map<string, ResolvedEntity>();

  for (const entry of entries) {
    const proto = entry.proto;

    // Skip abstract entities from the output
    if (proto.abstract) continue;

    const chain = buildChain(proto.id);
    const components = mergeComponents(chain);

    const resolved: ResolvedEntity = {
      id: proto.id,
      // Same coercion as tiles: YAML scalars are not guaranteed to be strings.
      name: String(proto.name ?? proto.id),
      description: String(proto.description ?? ''),
      suffix: String(proto.suffix ?? ''),
      abstract: false,
      categories: proto.categories ?? [],
      placement: proto.placement ?? {},
      components,
      spriteInfo: extractSpriteInfo(components),
      sourceCategory: entry.category,
      raw: proto,
    };

    result.set(proto.id, resolved);
  }

  return result;
}

/**
 * Resolve decal prototypes by merging parent chains for sprite info.
 * Abstract decals are used for resolution but excluded from results.
 */
export function resolveDecals(
  rawDecals: RawDecalPrototype[],
): Map<string, DecalPrototypeInfo> {
  // Index all decals by ID (including abstract ones, needed for parent resolution)
  const protoById = new Map<string, RawDecalPrototype>();
  for (const raw of rawDecals) {
    protoById.set(raw.id, raw);
  }

  /**
   * Build the ancestor chain for a decal, from root to leaf.
   */
  function buildChain(id: string, visited: Set<string> = new Set()): RawDecalPrototype[] {
    if (visited.has(id)) return []; // circular reference guard
    const proto = protoById.get(id);
    if (!proto) return [];

    visited.add(id);
    const parentIds = proto.parent
      ? Array.isArray(proto.parent) ? proto.parent : [proto.parent]
      : [];

    const ancestors: RawDecalPrototype[] = [];
    for (const parentId of parentIds) {
      const parentChain = buildChain(parentId, new Set(visited));
      for (const ancestor of parentChain) {
        if (!ancestors.some(a => a.id === ancestor.id)) {
          ancestors.push(ancestor);
        }
      }
    }

    return [...ancestors, proto];
  }

  const result = new Map<string, DecalPrototypeInfo>();

  for (const raw of rawDecals) {
    if (raw.abstract) continue;

    // Build chain and merge sprite info from parents
    const chain = buildChain(raw.id);
    let rsiPath = '';
    let state = '';
    let tags: string[] = [];
    let snapCardinals = false;
    let defaultCustomColor = false;

    for (const proto of chain) {
      if (proto.sprite?.sprite) rsiPath = proto.sprite.sprite;
      if (proto.sprite?.state) state = proto.sprite.state;
      if (proto.tags) tags = proto.tags;
      if (proto.snapCardinals !== undefined) snapCardinals = proto.snapCardinals;
      if (proto.defaultCustomColor !== undefined) defaultCustomColor = proto.defaultCustomColor;
    }

    // Skip decals with no sprite info
    if (!rsiPath && !state) continue;

    result.set(raw.id, {
      id: raw.id,
      rsiPath,
      state,
      tags,
      snapCardinals,
      defaultCustomColor,
    });
  }

  return result;
}
