/** Raw parsed tile prototype from YAML */
export interface RawTilePrototype {
  type: 'tile';
  id: string;
  name?: string;
  sprite?: string;       // e.g., "/Textures/Tiles/steel.png"
  variants?: number;
  placementVariants?: number[];
  baseTurf?: string;
  isSubfloor?: boolean;
  isSpace?: boolean;
  thermalConductivity?: number;
  heatCapacity?: number;
  friction?: number;
  deconstructTools?: string[];
  footstepSounds?: unknown;
  itemDrop?: string;
}

/** Raw parsed entity prototype from YAML */
export interface RawEntityPrototype {
  type: 'entity';
  id: string;
  parent?: string | string[];
  name?: string;
  description?: string;
  suffix?: string;
  abstract?: boolean;
  categories?: string[];
  placement?: { mode?: string };
  components?: RawComponent[];
}

/** Raw component, we preserve all fields verbatim */
export interface RawComponent {
  type: string;
  [key: string]: unknown;
}

/** Sprite info extracted from a resolved entity's Sprite component */
export interface SpriteInfo {
  rsiPath: string;         // e.g., "Structures/Power/apc.rsi"
  baseState: string;       // e.g., "base"
  drawDepth?: string;
  noRot?: boolean;         // true = don't apply canvas rotation (direction frame still selected by entity rotation)
  color?: string;          // component-level color (e.g., "#FFFFFF80" for semi-transparent puddles)
  iconSmoothKey?: string;  // IconSmooth key for neighbor matching (entities with same key connect)
  iconSmoothBase?: string; // IconSmooth state prefix (e.g., "state_" for tables, "swindow" for shuttle windows)
  iconSmoothMode?: 'Corners' | 'CardinalFlags' | 'Diagonal'; // Smoothing mode (default: Corners)
  layers: SpriteLayerInfo[];
}

export interface SpriteLayerInfo {
  state: string;
  sprite?: string;   // per-layer RSI path override (e.g., spawners use a different RSI for the entity preview)
  map?: string[];
  visible?: boolean;
  shader?: string;
  color?: string;
  scale?: { x: number; y: number };
}

/** Resolved tile (no inheritance, stored as-is) */
export interface ResolvedTile {
  id: string;
  name: string;
  sprite: string | null;   // null for Space
  variants: number;
  isSubfloor: boolean;
  isSpace: boolean;
  baseTurf: string | null;
  raw: RawTilePrototype;   // preserve original for export
}

/** Resolved entity (fully merged with parents) */
export interface ResolvedEntity {
  id: string;
  name: string;
  description: string;
  suffix: string;
  abstract: boolean;
  categories: string[];
  placement: { mode?: string };
  components: RawComponent[];
  spriteInfo: SpriteInfo | null;
  sourceCategory: string;  // derived from file path, e.g. "Structures/Doors"
  raw: RawEntityPrototype; // preserve original for export
}

/** Raw parsed decal prototype from YAML */
export interface RawDecalPrototype {
  type: 'decal';
  id: string;
  sprite?: { sprite?: string; state?: string };
  tags?: string[];
  snapCardinals?: boolean;
  defaultCustomColor?: boolean;
  defaultSnap?: boolean;
  defaultCleanable?: boolean;
  parent?: string | string[];
  abstract?: boolean;
}

/** Resolved decal prototype info for rendering */
export interface DecalPrototypeInfo {
  id: string;
  rsiPath: string;    // e.g., "Decals/markings.rsi"
  state: string;      // e.g., "arrows_greyscale"
  tags: string[];
  snapCardinals: boolean;
  defaultCustomColor: boolean;
}

/** The prototype registry public interface */
export interface IPrototypeRegistry {
  getTile(id: string): ResolvedTile | null;
  getEntity(id: string): ResolvedEntity | null;
  getAllTiles(): ResolvedTile[];
  getAllEntities(): ResolvedEntity[];
  getEntitiesByCategory(category: string): ResolvedEntity[];
  getCategories(): string[];
  getSpriteInfo(entityId: string): SpriteInfo | null;
  getDecal(id: string): DecalPrototypeInfo | null;
  getAllDecals(): DecalPrototypeInfo[];
  readonly tileCount: number;
  readonly entityCount: number;
  readonly decalCount: number;
}
