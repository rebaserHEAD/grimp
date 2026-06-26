# Prototype Registry

The prototype registry discovers, parses, resolves, and indexes all game content (tiles and entities) from the SS14 `Resources/Prototypes/` directory. It is the single source of truth for what game content exists and how it should be rendered.

## Architecture

```
Resources/Prototypes/*.yml
        │
        ▼
  Discovery (prototypeDiscovery.ts)
  - Fetches file listings via /resources-list endpoint
  - Parses YAML into RawTilePrototype / RawEntityPrototype
  - Derives categories from file paths
        │
        ▼
  Resolution (prototypeResolver.ts)
  - Tiles: defaults missing fields, stored as-is
  - Entities: resolves parent chains, merges components
  - Extracts SpriteInfo from Sprite components
        │
        ▼
  Registry (prototypeRegistry.ts)
  - Indexes tiles and entities by ID
  - Groups entities by source category
  - Provides public query API
```

## Files

| File | Purpose |
|------|---------|
| `src/loaders/registryTypes.ts` | All type definitions (raw, resolved, interfaces) |
| `src/loaders/prototypeDiscovery.ts` | YAML fetching, parsing, and category derivation |
| `src/loaders/prototypeResolver.ts` | Parent chain resolution and sprite info extraction |
| `src/loaders/prototypeRegistry.ts` | Registry class with lookup and indexing |
| `src/loaders/initRegistry.ts` | Top-level orchestrator: discover → resolve → build |

## Public API

```typescript
interface IPrototypeRegistry {
  getTile(id: string): ResolvedTile | null;
  getEntity(id: string): ResolvedEntity | null;
  getAllTiles(): ResolvedTile[];
  getAllEntities(): ResolvedEntity[];
  getEntitiesByCategory(category: string): ResolvedEntity[];
  getCategories(): string[];
  getSpriteInfo(entityId: string): SpriteInfo | null;
  readonly tileCount: number;
  readonly entityCount: number;
}
```

## Key Concepts

### Discovery

The `/resources-list` Vite endpoint provides recursive directory listings. Discovery fetches all `.yml` files under `Prototypes/Tiles/`, `Prototypes/Entities/`, and `Prototypes/Catalog/`, parses each with `js-yaml`, and extracts entries with `type: 'tile'` or `type: 'entity'`.

#### Catalog Directory Scanning

SS14 stores "filled" entity variants (e.g., `LockerRepresentativeFilled`, `BookshelfFilled`, `CrateNPCHamlet`) in `Prototypes/Catalog/Fills/`. These entities inherit their Sprite component from parents in `Prototypes/Entities/` and only add content-fill components (like `EntityTableContainerFill`). Discovery scans `Prototypes/Catalog/` and all fork equivalents (e.g., `Prototypes/_MyFork/Catalog/`). Categories for catalog entities use the `Catalog/` prefix (e.g., `Catalog/Fills/Lockers`).

#### Fork Directory Scanning

SS14 forks store prototype overrides in `Prototypes/_<ForkName>/Entities/`, `Prototypes/_<ForkName>/Tiles/`, and `Prototypes/_<ForkName>/Catalog/`. Discovery automatically detects all `_*` subdirectories under `Prototypes/` and scans each fork's `Entities/`, `Tiles/`, and `Catalog/` directories. Fork prototypes are merged into the same registry as base prototypes, if a fork defines the same entity ID as the base, the fork's definition wins (later in the resolution chain). Entity categories are derived correctly from fork paths (e.g., `Prototypes/_MyFork/Entities/Structures/Furniture/chairs.yml` → `Structures/Furniture`).

### Entity Inheritance

Entity prototypes reference parents via the `parent` field (string or string array). Resolution walks the full ancestor chain (root to leaf) and merges components by `type`, a child's component of the same type overwrites the parent's. Abstract entities (`abstract: true`) participate in resolution but are excluded from the final registry.

### Sprite Info Extraction

During resolution, each entity's `Sprite` component is parsed to extract:
- `rsiPath`, path to the `.rsi` directory (e.g., `Structures/Power/apc.rsi`)
- `baseState`, the sprite state to render (e.g., `base`)
- `noRot`, whether to skip canvas rotation (the entity's rotation still selects the correct RSI direction frame)
- `color`, component-level color tint (e.g., `"#FFFFFF80"` for Puddle's 50% opacity). Read from the first sprite layer's `color` field or the Sprite component's `color` field.
- `layers`, all sprite layers with state, per-layer RSI overrides, visibility, color, etc.
- `iconSmoothKey`, smoothing key for neighbor matching (from IconSmooth component)
- `iconSmoothBase`, state prefix for smooth states (e.g., `"solid"` → states `solid0`–`solid7`)
- `iconSmoothMode`, `'corners'` (walls/tables/carpets) or `'cardinalFlags'` (puddles)

This data is used by the RSI loader to fetch and render sprites.

#### RSI Path Resolution

The `rsiPath` is resolved using a fallback chain:
1. **Top-level `sprite` field** on the Sprite component (most common)
2. **First visible layer's `sprite` field**, for entities like `Puddle` that only define RSI paths in layers

#### Base State Resolution

The `baseState` is resolved using a fallback chain:
1. **First matching layer state**, the first layer whose `sprite` field is absent or matches the top-level RSI. This prevents cross-RSI mismatches (e.g., GasVentPump's pipe layer referencing a different RSI than the vent RSI).
2. **Direct `state` field** on the Sprite component
3. **IconSmooth `base` prefix**, walls/windows use `IconSmooth` with a `base` field (e.g., `solid`). The editor uses `{base}0` as the state (e.g., `solid0`).
4. **Icon component `state`**, last resort fallback

For entities with IconSmooth, the baseState used for **palette preview** follows a special chain to avoid showing quarter-tile corner pieces:
1. Icon component's `state` (e.g., `'full'` for carpets)
2. `'full'` (SS14 convention for IconSmooth RSIs)
3. `{base}0` as last resort

#### IconSmooth Base and Mode Inference

When IconSmooth has no explicit `base` field (e.g., Puddle), `inferSmoothBase()` extracts it from the baseState pattern by stripping the trailing digit (e.g., `"splat0"` → `"splat"`). When no explicit mode is set, `inferSmoothMode()` defaults to `'cardinalFlags'` (matching PuddleSystem runtime behavior).

### Categorization

Entity categories are derived from their source file path:
- `/Prototypes/Entities/Structures/Doors/airlocks.yml` → `"Structures/Doors"`
- `/Prototypes/Catalog/Fills/Lockers/representatives.yml` → `"Catalog/Fills/Lockers"`

This maps naturally to the game's directory structure and is used for palette browsing.

## Initialization

```typescript
import { initRegistry } from './loaders/initRegistry';

const registry = await initRegistry('', (msg) => console.log(msg));
// registry.tileCount → e.g., 85
// registry.entityCount → e.g., 3000+
```

## Extending

To support a new prototype type (e.g., `reagent`):
1. Add raw and resolved types to `registryTypes.ts`
2. Add filtering in `parsePrototypeYaml` for the new `type` value
3. Add resolution logic if inheritance applies
4. Add storage and query methods to `PrototypeRegistry`
5. Update `initRegistry` to wire the new type through

## Tests

Tests cover the synchronous parsing and resolution logic:
- `prototypeDiscovery.test.ts`, YAML parsing, category derivation, filtering
- `prototypeResolver.test.ts`, Tile defaults, parent chain merging, sprite extraction
- `prototypeRegistry.test.ts`, Lookup, category grouping, listing
